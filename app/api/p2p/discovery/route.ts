import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { accessErrorResponse, requestOwnerId } from "../../../api-security";

const text = (value: unknown, limit: number) =>
  String(value ?? "").trim().slice(0, limit);

function iceServers() {
  const raw = text(
    (env as unknown as Record<string, unknown>).P2P_STUN_URLS,
    1000,
  );
  return raw
    ? raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((urls) => ({ urls }))
    : [];
}

function accessUrl(request: Request) {
  const configured = text(
    (env as unknown as Record<string, unknown>).LAN_ORIGIN,
    512,
  ).replace(/\/+$/, "");
  if (configured) {
    try {
      const parsed = new URL(configured);
      const requestUrl = new URL(request.url);
      const localRequest =
        requestUrl.hostname === "localhost" ||
        requestUrl.hostname === "127.0.0.1" ||
        requestUrl.hostname === "[::1]" ||
        /^(10|172\.(1[6-9]|2\d|3[0-1])|192\.168)\./.test(
          requestUrl.hostname,
        );
      if (
        localRequest &&
        (parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          /^(10|172\.(1[6-9]|2\d|3[0-1])|192\.168)\./.test(parsed.hostname))
      )
        parsed.port = requestUrl.port;
      if (parsed.protocol === "http:" || parsed.protocol === "https:")
        return parsed.origin;
    } catch {}
  }
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    const url = new URL(request.url);
    const room = text(url.searchParams.get("room") || "neo-home", 64);
    const node = text(url.searchParams.get("node"), 80);
    const ownerId = await requestOwnerId(request);
    const db = getDbBinding();
    await db
      .prepare("DELETE FROM peer_presence WHERE last_seen_at<datetime('now','-2 minutes')")
      .run();
    const peers = node
      ? await db
          .prepare(
            "SELECT node_id nodeId,label,last_seen_at lastSeenAt FROM peer_presence WHERE owner_id=? AND room=? AND node_id<>? AND last_seen_at>=datetime('now','-30 seconds') ORDER BY last_seen_at DESC LIMIT 12",
          )
          .bind(ownerId, room, node)
          .all<{ nodeId: string; label: string; lastSeenAt: string }>()
      : { results: [] };
    return NextResponse.json({
      service: "_neo-ledger._tcp.local",
      protocol: "neo-ledger-p2p/2",
      signaling: new URL("/api/p2p/signals", request.url).toString(),
      transport: "WebRTC DataChannel",
      crdt: "transaction set + tombstones",
      accessUrl: accessUrl(request),
      peers: peers.results,
      iceServers: iceServers(),
    });
  } catch (error) {
    return accessErrorResponse(error, "发现附近设备失败");
  }
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      room?: string;
      nodeId?: string;
      label?: string;
    };
    const room = text(body.room || "neo-home", 64);
    const nodeId = text(body.nodeId, 80);
    const label = text(body.label || nodeId, 60);
    if (!room || !nodeId) throw new Error("设备发现参数不完整");
    const ownerId = await requestOwnerId(request);
    await getDbBinding()
      .prepare(
        `INSERT INTO peer_presence(owner_id,room,node_id,label,last_seen_at)
         VALUES(?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT(owner_id,room,node_id) DO UPDATE SET
           label=excluded.label,last_seen_at=excluded.last_seen_at`,
      )
      .bind(ownerId, room, nodeId, label)
      .run();
    return NextResponse.json({ ok: true, iceServers: iceServers() });
  } catch (error) {
    return accessErrorResponse(error, "登记附近设备失败");
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const url = new URL(request.url);
    const room = text(url.searchParams.get("room") || "neo-home", 64);
    const nodeId = text(url.searchParams.get("node"), 80);
    const ownerId = await requestOwnerId(request);
    if (nodeId)
      await getDbBinding()
        .prepare(
          "DELETE FROM peer_presence WHERE owner_id=? AND room=? AND node_id=?",
        )
        .bind(ownerId, room, nodeId)
        .run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "移除附近设备失败");
  }
}
