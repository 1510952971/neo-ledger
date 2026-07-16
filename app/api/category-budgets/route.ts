import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";

export async function GET(request: Request) {
  await ensureDb();
  const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
  await claimAndRequireLedger(request, ledgerId);
  const rows = await getDbBinding()
    .prepare(
      "SELECT ledger_id ledgerId,category,amount,updated_at updatedAt FROM category_budgets WHERE ledger_id=? ORDER BY category",
    )
    .bind(ledgerId)
    .all();
  return NextResponse.json(rows.results);
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      category?: string;
      amount?: number;
      ledgerId?: number;
    };
    const ledgerId = Number(body.ledgerId || 1);
    await claimAndRequireLedger(request, ledgerId);
    const category = String(body.category || "");
    const valid = await getDbBinding()
      .prepare(
        "SELECT id FROM expense_categories WHERE ledger_id=? AND name=? AND is_active=1",
      )
      .bind(ledgerId, category)
      .first();
    if (!valid) throw new Error("分类不存在或已停用");
    const amount = Math.max(0, Math.round(Number(body.amount) * 100));
    if (!Number.isFinite(amount)) throw new Error("金额错误");
    await getDbBinding()
      .prepare(
        "INSERT INTO category_budgets(ledger_id,category,amount,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(ledger_id,category) DO UPDATE SET amount=excluded.amount,updated_at=CURRENT_TIMESTAMP",
      )
      .bind(ledgerId, category, amount)
      .run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "保存失败");
  }
}
