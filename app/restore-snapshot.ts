import { ApiAccessError } from "./api-security";
import { getDbBinding } from "../db";
import { MAX_RESTORE_BODY_BYTES, readResponseTextWithLimit } from "./request-limits";

const MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024;
const CHUNK_CHARACTERS = 180_000;
const SNAPSHOT_RETENTION = 3;

type SnapshotMeta = {
  id: string;
  createdAt: string;
  checksum: string;
  totalBytes: number;
  chunkCount: number;
};

async function ensureSnapshotTables(db: D1Database) {
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS restore_snapshots(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,checksum TEXT NOT NULL,total_bytes INTEGER NOT NULL,chunk_count INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS restore_snapshot_chunks(snapshot_id TEXT NOT NULL,chunk_index INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(snapshot_id,chunk_index))",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS restore_snapshot_commits(snapshot_id TEXT PRIMARY KEY,committed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS restore_snapshot_commits_created_idx ON restore_snapshot_commits(committed_at DESC)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS restore_snapshot_commit_migrations(id INTEGER PRIMARY KEY CHECK(id=1),migrated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS restore_snapshots_owner_idx ON restore_snapshots(owner_id,created_at DESC)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS restore_staging(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,checksum TEXT NOT NULL,total_bytes INTEGER NOT NULL,chunk_count INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS restore_staging_chunks(staging_id TEXT NOT NULL,chunk_index INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(staging_id,chunk_index))",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS restore_staging_commits(staging_id TEXT PRIMARY KEY,committed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS restore_staging_owner_idx ON restore_staging(owner_id,created_at DESC)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS restore_locks(owner_id TEXT PRIMARY KEY,lock_id TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS restore_locks_expiry_idx ON restore_locks(expires_at)",
    ),
  ]);
  await db.batch([
    db.prepare("DELETE FROM restore_staging_chunks WHERE staging_id IN (SELECT id FROM restore_staging WHERE created_at < datetime('now', '-1 hour'))"),
    db.prepare("DELETE FROM restore_staging_commits WHERE staging_id IN (SELECT id FROM restore_staging WHERE created_at < datetime('now', '-1 hour'))"),
    db.prepare("DELETE FROM restore_staging WHERE created_at < datetime('now', '-1 hour')"),
  ]);
  const migrated = await db
    .prepare("SELECT id FROM restore_snapshot_commit_migrations WHERE id=1")
    .first<{ id: number }>();
  if (!migrated) {
    // Snapshots created before the commit marker was introduced are considered
    // committed for backwards compatibility. The one-time marker prevents a
    // new, partially written snapshot from being backfilled after a crash.
    await db.batch([
      db.prepare(
        "INSERT OR IGNORE INTO restore_snapshot_commits(snapshot_id,committed_at) SELECT id,created_at FROM restore_snapshots",
      ),
      db.prepare(
        "INSERT OR IGNORE INTO restore_snapshot_commit_migrations(id) VALUES(1)",
      ),
    ]);
  }
}

/**
 * Persist a validated restore plan in an isolated, commit-marked namespace.
 * The live ledger is not touched until the caller has loaded and re-verified
 * this staged payload and is ready to execute its single database batch.
 */
export async function createRestoreStaging(ownerId: string, payload: string) {
  const totalBytes = new TextEncoder().encode(payload).byteLength;
  if (totalBytes > MAX_SNAPSHOT_BYTES)
    throw new ApiAccessError("恢复计划超过 50 MB，无法暂存", 413);
  const db = getDbBinding();
  await ensureSnapshotTables(db);
  const id = crypto.randomUUID();
  const pieces: string[] = [];
  for (let index = 0; index < payload.length; index += CHUNK_CHARACTERS)
    pieces.push(payload.slice(index, index + CHUNK_CHARACTERS));
  const createdAt = new Date().toISOString();
  const digest = await checksum(payload);
  try {
    await db.prepare(
      "INSERT INTO restore_staging(id,owner_id,checksum,total_bytes,chunk_count,created_at) VALUES(?,?,?,?,?,?)",
    ).bind(id, ownerId, digest, totalBytes, pieces.length, createdAt).run();
    for (let start = 0; start < pieces.length; start += 40) {
      await db.batch(
        pieces.slice(start, start + 40).map((piece, offset) => db.prepare(
          "INSERT INTO restore_staging_chunks(staging_id,chunk_index,payload) VALUES(?,?,?)",
        ).bind(id, start + offset, piece)),
      );
    }
    await db.prepare(
      "INSERT INTO restore_staging_commits(staging_id,committed_at) VALUES(?,?)",
    ).bind(id, createdAt).run();
  } catch {
    await db.batch([
      db.prepare("DELETE FROM restore_staging_commits WHERE staging_id=?").bind(id),
      db.prepare("DELETE FROM restore_staging_chunks WHERE staging_id=?").bind(id),
      db.prepare("DELETE FROM restore_staging WHERE id=? AND owner_id=?").bind(id, ownerId),
    ]).catch(() => undefined);
    throw new ApiAccessError("恢复计划暂存失败，已取消恢复", 503);
  }
  return { id, createdAt, checksum: digest, totalBytes, chunkCount: pieces.length };
}

export async function loadRestoreStaging(ownerId: string, id: string) {
  if (!/^[0-9a-f-]{32,64}$/i.test(id))
    throw new ApiAccessError("恢复暂存编号无效", 400);
  const db = getDbBinding();
  await ensureSnapshotTables(db);
  const meta = await db.prepare(
    "SELECT s.id,s.checksum,s.total_bytes AS totalBytes,s.chunk_count AS chunkCount FROM restore_staging s JOIN restore_staging_commits c ON c.staging_id=s.id WHERE s.id=? AND s.owner_id=?",
  ).bind(id, ownerId).first<SnapshotMeta>();
  if (!meta) throw new ApiAccessError("恢复暂存不存在或无权访问", 404);
  const rows = (await db.prepare(
    "SELECT payload FROM restore_staging_chunks WHERE staging_id=? ORDER BY chunk_index",
  ).bind(id).all<{ payload: string }>()).results;
  const payload = rows.map((row) => row.payload).join("");
  if (new TextEncoder().encode(payload).byteLength !== meta.totalBytes || await checksum(payload) !== meta.checksum)
    throw new ApiAccessError("恢复暂存校验失败，已取消恢复", 409);
  let parsed: unknown;
  try { parsed = JSON.parse(payload); } catch { throw new ApiAccessError("恢复暂存不是有效 JSON", 409); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new ApiAccessError("恢复暂存格式无效", 409);
  return parsed as Record<string, unknown>;
}

export async function deleteRestoreStaging(ownerId: string, id: string) {
  if (!/^[0-9a-f-]{32,64}$/i.test(id)) return;
  const db = getDbBinding();
  await ensureSnapshotTables(db);
  await db.batch([
    db.prepare("DELETE FROM restore_staging_commits WHERE staging_id IN (SELECT id FROM restore_staging WHERE id=? AND owner_id=?)").bind(id, ownerId),
    db.prepare("DELETE FROM restore_staging_chunks WHERE staging_id IN (SELECT id FROM restore_staging WHERE id=? AND owner_id=?)").bind(id, ownerId),
    db.prepare("DELETE FROM restore_staging WHERE id=? AND owner_id=?").bind(id, ownerId),
  ]);
}

const RESTORE_LOCK_MS = 10 * 60_000;

/** Serialize destructive restores per owner; an expired lock is recoverable after a crashed request. */
export async function acquireRestoreLock(ownerId: string, now = Date.now()) {
  const db = getDbBinding();
  await ensureSnapshotTables(db);
  const lockId = crypto.randomUUID();
  const expiresAt = now + RESTORE_LOCK_MS;
  await db.batch([
    db.prepare("DELETE FROM restore_locks WHERE expires_at<=?").bind(now),
    db
      .prepare("INSERT OR IGNORE INTO restore_locks(owner_id,lock_id,expires_at) VALUES(?,?,?)")
      .bind(ownerId, lockId, expiresAt),
  ]);
  const row = await db
    .prepare("SELECT lock_id lockId,expires_at expiresAt FROM restore_locks WHERE owner_id=?")
    .bind(ownerId)
    .first<{ lockId: string; expiresAt: number }>();
  return row?.lockId === lockId && row.expiresAt > now ? { lockId, expiresAt } : null;
}

export async function releaseRestoreLock(ownerId: string, lockId: string) {
  const db = getDbBinding();
  await ensureSnapshotTables(db);
  await db
    .prepare("DELETE FROM restore_locks WHERE owner_id=? AND lock_id=?")
    .bind(ownerId, lockId)
    .run();
}

async function checksum(payload: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function createRestoreSnapshot(
  request: Request,
  ownerId: string,
): Promise<SnapshotMeta> {
  const { GET: exportData } = await import("./api/data/export/route");
  const exportUrl = new URL(request.url);
  exportUrl.pathname = "/api/data/export";
  exportUrl.search = "?format=json";
  const response = await exportData(
    new Request(exportUrl, { headers: request.headers }),
  );
  if (!response.ok)
    throw new ApiAccessError("恢复前自动快照创建失败，已取消恢复", 503);
  const payload = await readResponseTextWithLimit(response, MAX_RESTORE_BODY_BYTES);
  const totalBytes = new TextEncoder().encode(payload).byteLength;
  if (totalBytes > MAX_SNAPSHOT_BYTES)
    throw new ApiAccessError("当前账本超过 50 MB，无法创建恢复前快照", 413);

  const db = getDbBinding();
  await ensureSnapshotTables(db);
  const id = crypto.randomUUID();
  const pieces: string[] = [];
  for (let index = 0; index < payload.length; index += CHUNK_CHARACTERS)
    pieces.push(payload.slice(index, index + CHUNK_CHARACTERS));
  const createdAt = new Date().toISOString();
  const digest = await checksum(payload);
  try {
    await db
      .prepare(
        "INSERT INTO restore_snapshots(id,owner_id,checksum,total_bytes,chunk_count,created_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(id, ownerId, digest, totalBytes, pieces.length, createdAt)
      .run();
    for (let start = 0; start < pieces.length; start += 40) {
      await db.batch(
        pieces.slice(start, start + 40).map((piece, offset) =>
          db
            .prepare(
              "INSERT INTO restore_snapshot_chunks(snapshot_id,chunk_index,payload) VALUES(?,?,?)",
            )
            .bind(id, start + offset, piece),
        ),
      );
    }
    // The metadata is deliberately invisible to list/load until every chunk
    // has been persisted successfully.
    await db
      .prepare(
        "INSERT INTO restore_snapshot_commits(snapshot_id,committed_at) VALUES(?,?)",
      )
      .bind(id, createdAt)
      .run();
  } catch {
    await db
      .batch([
        db.prepare("DELETE FROM restore_snapshot_commits WHERE snapshot_id=?").bind(id),
        db.prepare("DELETE FROM restore_snapshot_chunks WHERE snapshot_id=?").bind(id),
        db.prepare("DELETE FROM restore_snapshots WHERE id=?").bind(id),
      ])
      .catch(() => undefined);
    throw new ApiAccessError("恢复前自动快照写入失败，已取消恢复", 503);
  }
  await db.batch([
    db
      .prepare(
        "DELETE FROM restore_snapshot_chunks WHERE snapshot_id IN (SELECT id FROM restore_snapshots WHERE owner_id=? AND id NOT IN (SELECT id FROM restore_snapshots WHERE owner_id=? ORDER BY created_at DESC LIMIT ?))",
      )
      .bind(ownerId, ownerId, SNAPSHOT_RETENTION),
    db
      .prepare(
        "DELETE FROM restore_snapshot_commits WHERE snapshot_id IN (SELECT id FROM restore_snapshots WHERE owner_id=? AND id NOT IN (SELECT id FROM restore_snapshots WHERE owner_id=? ORDER BY created_at DESC LIMIT ?))",
      )
      .bind(ownerId, ownerId, SNAPSHOT_RETENTION),
    db
      .prepare(
        "DELETE FROM restore_snapshots WHERE owner_id=? AND id NOT IN (SELECT id FROM restore_snapshots WHERE owner_id=? ORDER BY created_at DESC LIMIT ?)",
      )
      .bind(ownerId, ownerId, SNAPSHOT_RETENTION),
  ]);
  return { id, createdAt, checksum: digest, totalBytes, chunkCount: pieces.length };
}

export async function listRestoreSnapshots(ownerId: string) {
  const db = getDbBinding();
  await ensureSnapshotTables(db);
  return (
    await db
      .prepare(
        "SELECT s.id,s.created_at AS createdAt,s.checksum,s.total_bytes AS totalBytes,s.chunk_count AS chunkCount FROM restore_snapshots s JOIN restore_snapshot_commits c ON c.snapshot_id=s.id WHERE s.owner_id=? ORDER BY s.created_at DESC LIMIT ?",
      )
      .bind(ownerId, SNAPSHOT_RETENTION)
      .all<SnapshotMeta>()
  ).results;
}

export async function loadRestoreSnapshot(ownerId: string, id: string) {
  if (!/^[0-9a-f-]{32,64}$/i.test(id))
    throw new ApiAccessError("恢复快照编号无效", 400);
  const db = getDbBinding();
  await ensureSnapshotTables(db);
  const meta = await db
    .prepare(
      "SELECT s.id,s.created_at AS createdAt,s.checksum,s.total_bytes AS totalBytes,s.chunk_count AS chunkCount FROM restore_snapshots s JOIN restore_snapshot_commits c ON c.snapshot_id=s.id WHERE s.id=? AND s.owner_id=?",
    )
    .bind(id, ownerId)
    .first<SnapshotMeta>();
  if (!meta) throw new ApiAccessError("恢复快照不存在或无权访问", 404);
  const rows = (
    await db
      .prepare(
        "SELECT payload FROM restore_snapshot_chunks WHERE snapshot_id=? ORDER BY chunk_index",
      )
      .bind(id)
      .all<{ payload: string }>()
  ).results;
  const payload = rows.map((row) => row.payload).join("");
  if (new TextEncoder().encode(payload).byteLength !== meta.totalBytes)
    throw new ApiAccessError("恢复快照校验失败，无法使用", 409);
  if ((await checksum(payload)) !== meta.checksum)
    throw new ApiAccessError("恢复快照校验失败，无法使用", 409);
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    throw new ApiAccessError("恢复快照内容无效", 409);
  }
}
