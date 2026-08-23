import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { accessErrorResponse, requestOwnerId } from "../../../api-security";
import { requireSameOrigin } from "../../../auth";
import { MAX_PROTOCOL_BODY_BYTES, readJsonWithLimit } from "../../../request-limits";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    const db = getDbBinding();
    await db
      .prepare("DELETE FROM peer_signals WHERE created_at<datetime('now','-15 minutes')")
      .run();
    const url = new URL(request.url),
    roomName = String(url.searchParams.get("room") || "").slice(0, 64),
    node = String(url.searchParams.get("node") || "").slice(0, 80),
    after = Number(url.searchParams.get("after") || 0);
    if (!roomName || !node) throw new Error("缺少节点参数");
    const room = `${await requestOwnerId(request)}:${roomName}`;
    const rows = await db
      .prepare(
        "SELECT id,from_node fromNode,kind,payload,created_at createdAt FROM peer_signals WHERE room=? AND to_node=? AND id>? AND created_at>=datetime('now','-10 minutes') ORDER BY id LIMIT 50",
      )
      .bind(room, node, after)
      .all();
    return privateJson(rows.results);
  } catch (error) {
    return accessErrorResponse(error, "读取信令失败", request);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureDb();
    const db = getDbBinding();
    await db
      .prepare("DELETE FROM peer_signals WHERE created_at<datetime('now','-15 minutes')")
      .run();
    const body = await readJsonWithLimit<{
      room?: string;
      fromNode?: string;
      toNode?: string;
      kind?: string;
      payload?: unknown;
    }>(request, MAX_PROTOCOL_BODY_BYTES);
    const roomName = String(body.room || "").slice(0, 64),
      from = String(body.fromNode || "").slice(0, 80),
      to = String(body.toNode || "").slice(0, 80),
      kind = String(body.kind || "").slice(0, 20),
      payload = JSON.stringify(body.payload ?? {});
    if (!roomName || !from || !to || !kind || payload.length > 100000)
      throw new Error("信令无效");
    const room = `${await requestOwnerId(request)}:${roomName}`;
    const result = await db
      .prepare(
        "INSERT INTO peer_signals(room,from_node,to_node,kind,payload) VALUES(?,?,?,?,?)",
      )
      .bind(room, from, to, kind, payload)
      .run();
    return privateJson(
      { ok: true, id: Number(result.meta.last_row_id) },
      { status: 201 },
    );
  } catch (error) {
    return accessErrorResponse(error, "信令失败", request);
  }
}
