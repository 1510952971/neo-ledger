import { NextResponse } from "next/server";
import { ApiAccessError, accessErrorResponse, requestOwnerId } from "../../../api-security";
import { decodeAuditCursor, listAuditEvents, requestIdFromRequest } from "../../../audit-log";

function privateJson(body: unknown, request: Request) {
  const headers = new Headers({
    "Cache-Control": "no-store, private, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "X-Request-ID": requestIdFromRequest(request),
  });
  return NextResponse.json(body, { headers });
}

export async function GET(request: Request) {
  try {
    const ownerId = await requestOwnerId(request);
    const search = new URL(request.url).searchParams;
    const raw = Number(search.get("limit") ?? 100);
    const rawCursor = search.get("cursor");
    const cursor = rawCursor ? decodeAuditCursor(rawCursor) : undefined;
    if (rawCursor && !cursor) throw new ApiAccessError("审计分页游标无效", 400);
    const page = await listAuditEvents(ownerId, raw, cursor ?? undefined);
    const response = privateJson(page, request);
    response.headers.set("X-Has-More", page.hasMore ? "1" : "0");
    if (page.nextCursor) response.headers.set("X-Next-Cursor", page.nextCursor);
    return response;
  } catch (error) {
    return accessErrorResponse(error, "读取安全审计记录失败", request);
  }
}
