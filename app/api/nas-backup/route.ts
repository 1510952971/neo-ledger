import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { configValue } from "../../runtime-env";

const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const CHUNK_BYTES = 128 * 1024;
const REMOTE_RETENTION = 14;
const MAGIC = new TextEncoder().encode("NLBAK001");

function responseError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store, private, max-age=0",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function privateHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1)
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

function bearerAuthorized(request: Request) {
  const expected = configValue("NEO_NAS_BACKUP_TOKEN");
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.match(/^Bearer ([A-Za-z0-9_-]{40,160})$/)?.[1] ?? "";
  return expected.length >= 40 && constantTimeEqual(supplied, expected);
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(bytes: Uint8Array) {
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function readBoundedBody(request: Request) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BACKUP_BYTES) {
        await reader.cancel();
        throw new Error("backup_body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function PUT(request: Request) {
  try {
    if (!configValue("NEO_NAS_BACKUP_TOKEN"))
      return responseError("NAS 备份接收器尚未配置", 503);
    if (!bearerAuthorized(request)) return responseError("备份凭据无效", 401);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/octet-stream")
      return responseError("只接受加密备份二进制文件", 415);
    const declaredBytes = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BACKUP_BYTES)
      return responseError("备份超过 50 MiB 上限", 413);

    let bytes: Uint8Array;
    try {
      bytes = await readBoundedBody(request);
    } catch (error) {
      if (error instanceof Error && error.message === "backup_body_too_large")
        return responseError("备份超过 50 MiB 上限", 413);
      throw error;
    }
    if (bytes.length < MAGIC.length + 16 + 12 + 16 || bytes.length > MAX_BACKUP_BYTES)
      return responseError("备份大小无效或超过 50 MiB 上限", 413);
    if (!MAGIC.every((value, index) => bytes[index] === value))
      return responseError("备份加密封套版本不受支持", 400);

    await ensureDb();
    const db = getDbBinding();
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const checksum = await sha256(bytes);
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES)
      chunks.push(toBase64(bytes.subarray(offset, Math.min(bytes.length, offset + CHUNK_BYTES))));

    await db
      .prepare("INSERT INTO nas_backup_snapshots(id,checksum,total_bytes,chunk_count,created_at,status) VALUES(?,?,?,?,?,'staging')")
      .bind(id, checksum, bytes.length, chunks.length, createdAt)
      .run();
    try {
      for (let start = 0; start < chunks.length; start += 40) {
        await db.batch(
          chunks.slice(start, start + 40).map((payload, offset) =>
            db
              .prepare("INSERT INTO nas_backup_chunks(snapshot_id,chunk_index,payload) VALUES(?,?,?)")
              .bind(id, start + offset, payload),
          ),
        );
      }
      await db
        .prepare("UPDATE nas_backup_snapshots SET status='committed' WHERE id=? AND status='staging'")
        .bind(id)
        .run();
    } catch {
      await db.batch([
        db.prepare("DELETE FROM nas_backup_chunks WHERE snapshot_id=?").bind(id),
        db.prepare("DELETE FROM nas_backup_snapshots WHERE id=? AND status='staging'").bind(id),
      ]).catch(() => undefined);
      return responseError("备份未能完整保存；上一份成功快照保持不变", 503);
    }

    const obsolete = await db
      .prepare("SELECT id FROM nas_backup_snapshots WHERE status='committed' ORDER BY created_at DESC LIMIT -1 OFFSET ?")
      .bind(REMOTE_RETENTION)
      .all<{ id: string }>();
    if (obsolete.results.length) {
      const ids = obsolete.results.map((row) => row.id);
      for (let start = 0; start < ids.length; start += 40) {
        const batch = ids.slice(start, start + 40);
        const placeholders = batch.map(() => "?").join(",");
        await db.batch([
          db.prepare(`DELETE FROM nas_backup_chunks WHERE snapshot_id IN (${placeholders})`).bind(...batch),
          db.prepare(`DELETE FROM nas_backup_snapshots WHERE id IN (${placeholders}) AND status='committed'`).bind(...batch),
        ]);
      }
    }
    return NextResponse.json(
      { ok: true, id, createdAt, totalBytes: bytes.length, checksum },
      { headers: privateHeaders() },
    );
  } catch {
    return responseError("NAS 加密备份暂时无法保存", 503);
  }
}

export async function GET(request: Request) {
  try {
    if (!configValue("NEO_NAS_BACKUP_TOKEN"))
      return responseError("NAS 备份接收器尚未配置", 503);
    if (!bearerAuthorized(request)) return responseError("备份凭据无效", 401);
    await ensureDb();
    const db = getDbBinding();
    if (new URL(request.url).searchParams.get("status") === "1") {
      const latest = await db
        .prepare("SELECT id,checksum,total_bytes AS totalBytes,created_at AS createdAt FROM nas_backup_snapshots WHERE status='committed' ORDER BY created_at DESC LIMIT 1")
        .first<{ id: string; checksum: string; totalBytes: number; createdAt: string }>();
      return NextResponse.json(
        { ok: true, latest: latest ?? null },
        { headers: privateHeaders() },
      );
    }
    const requestedId = new URL(request.url).searchParams.get("id");
    if (requestedId && !/^[0-9a-f-]{36}$/i.test(requestedId))
      return responseError("备份 ID 格式无效", 400);
    const snapshot = requestedId
      ? await db
          .prepare("SELECT id,checksum,total_bytes AS totalBytes,chunk_count AS chunkCount,created_at AS createdAt FROM nas_backup_snapshots WHERE id=? AND status='committed'")
          .bind(requestedId)
          .first<{ id: string; checksum: string; totalBytes: number; chunkCount: number; createdAt: string }>()
      : await db
          .prepare("SELECT id,checksum,total_bytes AS totalBytes,chunk_count AS chunkCount,created_at AS createdAt FROM nas_backup_snapshots WHERE status='committed' ORDER BY created_at DESC LIMIT 1")
          .first<{ id: string; checksum: string; totalBytes: number; chunkCount: number; createdAt: string }>();
    if (!snapshot) return responseError("OCI 尚无可用 NAS 备份", 404);

    const rows = await db
      .prepare("SELECT payload FROM nas_backup_chunks WHERE snapshot_id=? ORDER BY chunk_index")
      .bind(snapshot.id)
      .all<{ payload: string }>();
    if (rows.results.length !== snapshot.chunkCount)
      return responseError("最近的 NAS 备份块数不完整，拒绝提供恢复文件", 503);
    const parts = rows.results.map((row) => fromBase64(row.payload));
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    if (length !== snapshot.totalBytes)
      return responseError("最近的 NAS 备份长度不匹配，拒绝提供恢复文件", 503);
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    if ((await sha256(bytes)) !== snapshot.checksum)
      return responseError("最近的 NAS 备份摘要校验失败，拒绝提供恢复文件", 503);

    return new Response(bytes, {
      headers: privateHeaders({
        "Content-Type": "application/octet-stream",
        "Content-Length": String(bytes.length),
        "X-Backup-Id": snapshot.id,
        "X-Backup-SHA256": snapshot.checksum,
        "X-Backup-Created-At": snapshot.createdAt,
        "Content-Disposition": 'attachment; filename="neo-ledger-nas-backup.bin"',
      }),
    });
  } catch {
    return responseError("NAS 加密备份暂时无法读取", 503);
  }
}
