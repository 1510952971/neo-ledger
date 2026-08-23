import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { accessErrorResponse, requestOwnerId } from "../../../api-security";
import { requireSameOrigin } from "../../../auth";
import { MAX_PROTOCOL_BODY_BYTES, readJsonWithLimit } from "../../../request-limits";

const MAX_PACKAGE_LENGTH = 8_000_000;

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

const text = (value: unknown, limit: number) =>
  String(value ?? "").trim().slice(0, limit);

function packageId() {
  if (typeof crypto.randomUUID === "function") return `pkg-${crypto.randomUUID()}`;
  return `pkg-${crypto.getRandomValues(new Uint8Array(16)).reduce((result, value) => result + value.toString(16).padStart(2, "0"), "")}`;
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    const url = new URL(request.url);
    const room = text(url.searchParams.get("room") || "neo-home", 64);
    const id = text(url.searchParams.get("id"), 100);
    const ownerId = await requestOwnerId(request);
    const db = getDbBinding();
    await db
      .prepare(
        "DELETE FROM nearby_packages WHERE expires_at<=datetime('now') OR consumed_at IS NOT NULL",
      )
      .run();
    if (id) {
      const row = await db
        .prepare(
          "SELECT id,payload,created_at createdAt FROM nearby_packages WHERE id=? AND owner_id=? AND room=? AND expires_at>datetime('now') AND consumed_at IS NULL",
        )
        .bind(id, ownerId, room)
        .first<{ id: string; payload: string; createdAt: string }>();
      if (!row) return privateJson({ error: "同步包不存在或已过期" }, { status: 404 });
      return privateJson(row);
    }
    const rows = await db
      .prepare(
        "SELECT id,length(payload) size,created_at createdAt FROM nearby_packages WHERE owner_id=? AND room=? AND expires_at>datetime('now') AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 10",
      )
      .bind(ownerId, room)
      .all<{ id: string; size: number; createdAt: string }>();
    return privateJson({ packages: rows.results });
  } catch (error) {
    return accessErrorResponse(error, "读取局域网同步包失败", request);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureDb();
    const body = await readJsonWithLimit<{
      room?: string;
      payload?: string;
    }>(request, MAX_PROTOCOL_BODY_BYTES);
    const room = text(body.room || "neo-home", 64);
    const payload = String(body.payload || "");
    if (!room || !payload || payload.length > MAX_PACKAGE_LENGTH)
      throw new Error("同步包为空或超过 8 MB 限制");
    const ownerId = await requestOwnerId(request);
    const id = packageId();
    const db = getDbBinding();
    await db
      .prepare(
        "DELETE FROM nearby_packages WHERE owner_id=? AND room=? AND (expires_at<=datetime('now') OR consumed_at IS NOT NULL)",
      )
      .bind(ownerId, room)
      .run();
    await db
      .prepare(
        "INSERT INTO nearby_packages(id,owner_id,room,payload,expires_at) VALUES(?,?,?,?,datetime('now','+15 minutes'))",
      )
      .bind(id, ownerId, room, payload)
      .run();
    return privateJson({ ok: true, id, expiresInMinutes: 15 }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error, "上传局域网同步包失败", request);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureDb();
    const url = new URL(request.url);
    const id = text(url.searchParams.get("id"), 100);
    if (!id) throw new Error("缺少同步包编号");
    const ownerId = await requestOwnerId(request);
    await getDbBinding()
      .prepare(
        "UPDATE nearby_packages SET consumed_at=datetime('now') WHERE id=? AND owner_id=?",
      )
      .bind(id, ownerId)
      .run();
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "清理局域网同步包失败", request);
  }
}
