import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { ApiAccessError, accessErrorResponse, claimAndRequireLedger, guardedApiResponse } from "../../api-security";
import { readMemberInput } from "../../internal-api-contract";
import { MAX_MEMBER_COUNT } from "../../member-limits";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取成员失败", async () => {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const total = await db
      .prepare("SELECT COUNT(*) count FROM members WHERE ledger_id=?")
      .bind(ledgerId)
      .first<{ count: number }>();
    const rows = await db
      .prepare(
        "SELECT id,ledger_id AS ledgerId,name,icon,is_me AS isMe,created_at AS createdAt FROM members WHERE ledger_id=? ORDER BY is_me DESC,id LIMIT ?",
      )
      .bind(ledgerId, MAX_MEMBER_COUNT)
      .all();
    const response = privateJson(rows.results);
    const totalCount = Number(total?.count ?? 0);
    response.headers.set("X-Total-Count", String(totalCount));
    response.headers.set("X-Has-More", totalCount > MAX_MEMBER_COUNT ? "1" : "0");
    return response;
  });
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await readMemberInput(request);
    const ledgerId = body.ledgerId;
    await claimAndRequireLedger(request, ledgerId);
    const { name, icon } = body;
    const db = getDbBinding();
    const count = await db
      .prepare("SELECT COUNT(*) count FROM members WHERE ledger_id=?")
      .bind(ledgerId)
      .first<{ count: number }>();
    if (Number(count?.count ?? 0) >= MAX_MEMBER_COUNT)
      throw new ApiAccessError("成员最多 " + MAX_MEMBER_COUNT + " 个", 409);
    const result = await db
      .prepare(
        "INSERT INTO members (ledger_id,name,icon,is_me) VALUES (?,?,?,0)",
      )
      .bind(ledgerId, name, icon)
      .run();
    return privateJson(
      {
        id: Number(result.meta.last_row_id),
        ledgerId,
        name,
        icon,
        isMe: false,
      },
      { status: 201 },
    );
  } catch (error) {
    return accessErrorResponse(error, "添加失败", request);
  }
}
