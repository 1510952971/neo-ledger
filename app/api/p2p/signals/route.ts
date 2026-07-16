import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { accessErrorResponse, requestOwnerId } from "../../../api-security";
export async function GET(request: Request) {
  try {
    await ensureDb();
    const url = new URL(request.url),
    roomName = String(url.searchParams.get("room") || "").slice(0, 64),
    node = String(url.searchParams.get("node") || "").slice(0, 80),
    after = Number(url.searchParams.get("after") || 0);
    if (!roomName || !node) throw new Error("缺少节点参数");
    const room = `${requestOwnerId(request)}:${roomName}`;
    const rows = await getDbBinding()
      .prepare(
        "SELECT id,from_node fromNode,kind,payload,created_at createdAt FROM peer_signals WHERE room=? AND to_node=? AND id>? AND created_at>=datetime('now','-10 minutes') ORDER BY id LIMIT 50",
      )
      .bind(room, node, after)
      .all();
    return NextResponse.json(rows.results);
  } catch (error) {
    return accessErrorResponse(error, "读取信令失败");
  }
}
export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      room?: string;
      fromNode?: string;
      toNode?: string;
      kind?: string;
      payload?: unknown;
    };
    const roomName = String(body.room || "").slice(0, 64),
      from = String(body.fromNode || "").slice(0, 80),
      to = String(body.toNode || "").slice(0, 80),
      kind = String(body.kind || "").slice(0, 20),
      payload = JSON.stringify(body.payload ?? {});
    if (!roomName || !from || !to || !kind || payload.length > 100000)
      throw new Error("信令无效");
    const room = `${requestOwnerId(request)}:${roomName}`;
    const result = await getDbBinding()
      .prepare(
        "INSERT INTO peer_signals(room,from_node,to_node,kind,payload) VALUES(?,?,?,?,?)",
      )
      .bind(room, from, to, kind, payload)
      .run();
    return NextResponse.json(
      { ok: true, id: Number(result.meta.last_row_id) },
      { status: 201 },
    );
  } catch (error) {
    return accessErrorResponse(error, "信令失败");
  }
}
