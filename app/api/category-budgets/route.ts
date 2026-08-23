import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger, guardedApiResponse } from "../../api-security";
import { readCategoryBudgetInput } from "../../internal-api-contract";
import { MAX_CATEGORY_COUNT } from "../../category-limits";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取分类预算失败", async () => {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const total = await db
      .prepare("SELECT COUNT(*) count FROM category_budgets WHERE ledger_id=?")
      .bind(ledgerId)
      .first<{ count: number }>();
    const rows = await db
      .prepare(
        "SELECT ledger_id ledgerId,category,amount,updated_at updatedAt FROM category_budgets WHERE ledger_id=? ORDER BY category LIMIT ?",
      )
      .bind(ledgerId, MAX_CATEGORY_COUNT)
      .all();
    const response = privateJson(rows.results);
    const totalCount = Number(total?.count ?? 0);
    response.headers.set("X-Total-Count", String(totalCount));
    response.headers.set("X-Has-More", totalCount > MAX_CATEGORY_COUNT ? "1" : "0");
    return response;
  });
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = await readCategoryBudgetInput(request);
    const ledgerId = body.ledgerId;
    await claimAndRequireLedger(request, ledgerId);
    const category = body.category;
    const valid = await getDbBinding()
      .prepare(
        "SELECT id FROM expense_categories WHERE ledger_id=? AND name=? AND is_active=1",
      )
      .bind(ledgerId, category)
      .first();
    if (!valid) throw new Error("分类不存在或已停用");
    const amount = Math.round(body.amount * 100);
    await getDbBinding()
      .prepare(
        "INSERT INTO category_budgets(ledger_id,category,amount,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(ledger_id,category) DO UPDATE SET amount=excluded.amount,updated_at=CURRENT_TIMESTAMP",
      )
      .bind(ledgerId, category, amount)
      .run();
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "保存失败", request);
  }
}
