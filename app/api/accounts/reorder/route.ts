import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { ApiAccessError, accessErrorResponse, claimAndRequireLedger } from "../../../api-security";
import { readAccountReorderInput } from "../../../internal-api-contract";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const { ledgerId, accountIds } = await readAccountReorderInput(request);
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const rows = await db
      .prepare("SELECT id FROM accounts WHERE ledger_id=? ORDER BY is_active DESC,sort_order,id")
      .bind(ledgerId)
      .all<{ id: number }>();
    const currentIds = rows.results.map((row) => Number(row.id));
    if (
      currentIds.length !== accountIds.length ||
      currentIds.some((id) => !accountIds.includes(id))
    ) {
      throw new ApiAccessError("账户列表已变化，请刷新后重新排序", 409);
    }
    const statements = accountIds.map((id, index) =>
      db
        .prepare("UPDATE accounts SET sort_order=? WHERE id=? AND ledger_id=?")
        .bind((index + 1) * 10, id, ledgerId),
    );
    if (statements.length) await db.batch(statements);
    return privateJson({ ok: true, accountIds });
  } catch (error) {
    return accessErrorResponse(error, "账户排序失败", request);
  }
}
