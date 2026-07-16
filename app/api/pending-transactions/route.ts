import { NextResponse } from "next/server";
import { ensureDb, evaluateAchievements, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";
export async function GET(request: Request) {
  await ensureDb();
  const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
  await claimAndRequireLedger(request, ledgerId);
  const rows = await getDbBinding()
    .prepare(
      "SELECT p.id,p.raw_text rawText,p.title,p.amount,p.type,p.account_id accountId,p.currency,p.occurred_at occurredAt,p.status,p.created_at createdAt,a.name accountName FROM pending_transactions p JOIN accounts a ON a.id=p.account_id WHERE p.ledger_id=? AND p.status='待确认' ORDER BY p.id DESC",
    )
    .bind(ledgerId)
    .all();
  return NextResponse.json(rows.results);
}
export async function PATCH(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      id?: number;
      category?: string;
      action?: "confirm" | "ignore";
    };
    const id = Number(body.id),
      db = getDbBinding(),
      row = await db
        .prepare(
          "SELECT * FROM pending_transactions WHERE id=? AND status='待确认'",
        )
        .bind(id)
        .first<{
          id: number;
          ledger_id: number;
          title: string;
          amount: number;
          type: string;
          account_id: number;
          currency: string;
          occurred_at: string;
          balance_applied: number;
        }>();
    if (!row) throw new Error("待确认流水不存在");
    await claimAndRequireLedger(request, row.ledger_id);
    if (body.action === "ignore") {
      await db.batch([
        db
          .prepare("UPDATE pending_transactions SET status='已忽略' WHERE id=?")
          .bind(id),
        db
          .prepare(
            "UPDATE accounts SET current_balance=current_balance+? WHERE id=?",
          )
          .bind(row.type === "支出" ? row.amount : -row.amount, row.account_id),
      ]);
      return NextResponse.json({ ok: true });
    }
    const configuredCategory = row.type === "支出"
      ? await db.prepare("SELECT name,builtin_key builtinKey FROM expense_categories WHERE ledger_id=? AND name=? AND is_active=1").bind(row.ledger_id, String(body.category)).first<{ name: string; builtinKey: string | null }>()
      : null;
    const configuredIncomeCategory = row.type === "收入"
      ? await db.prepare("SELECT name,builtin_key builtinKey FROM income_categories WHERE ledger_id=? AND is_active=1 ORDER BY CASE WHEN builtin_key='其它收入' THEN 0 ELSE 1 END,sort_order,id LIMIT 1").bind(row.ledger_id).first<{ name: string; builtinKey: string | null }>()
      : null;
    if (row.type === "支出" && !configuredCategory) throw new Error("请选择正确分类");
    if (row.type === "收入" && !configuredIncomeCategory) throw new Error("请先添加收入分类");
    await db.batch([
      db
        .prepare(
          "INSERT INTO transactions(ledger_id,title,amount,type,mood,category,category_dynamic,income_category,income_category_dynamic,account_id,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1000000,'legacy/unknown',?)",
        )
        .bind(
          row.ledger_id,
          row.title,
          row.amount,
          row.type,
          row.type === "支出" ? "刚需" : null,
          row.type === "支出" ? configuredCategory.builtinKey : null,
          row.type === "支出" ? configuredCategory.name : null,
          row.type === "收入" ? configuredIncomeCategory?.builtinKey : null,
          row.type === "收入" ? configuredIncomeCategory?.name : null,
          row.account_id,
          row.currency,
          row.amount,
          row.currency,
          row.occurred_at,
        ),
      db
        .prepare("UPDATE pending_transactions SET status='已确认' WHERE id=?")
        .bind(id),
    ]);
    await evaluateAchievements(row.ledger_id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "处理失败");
  }
}
