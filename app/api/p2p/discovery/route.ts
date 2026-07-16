import { NextResponse } from "next/server";
export async function GET(request: Request) {
  return NextResponse.json({
    service: "_neo-ledger._tcp.local",
    protocol: "neo-ledger-p2p/1",
    signaling: new URL("/api/p2p/signals", request.url).toString(),
    transport: "WebRTC DataChannel",
    crdt: "grow-only transaction set + tombstones",
    note: "Bonjour/mDNS 广播由 NAS 原生伴侣进程注册；浏览器通过此接口读取发现元数据。",
  });
}
