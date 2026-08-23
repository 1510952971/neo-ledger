import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../../api-security";
import { recordAuditEvent, requestIdFromRequest } from "../../../audit-log";
import { readBulkTransactionInput } from "../../../internal-api-contract";

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
    const body = await readBulkTransactionInput(request);
    const { ledgerId, transactionIds: ids } = body;
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const placeholders = ids.map(() => "?").join(",");
    const rows = await db
      .prepare(`SELECT id,type FROM transactions WHERE ledger_id=? AND id IN (${placeholders})`)
      .bind(ledgerId, ...ids)
      .all<{ id: number; type: "支出" | "收入" }>();
    if (rows.results.length !== ids.length) throw new Error("存在不属于当前账本的流水");
    const expense = body.category == null
      ? null
      : await db.prepare("SELECT name,builtin_key builtinKey FROM expense_categories WHERE ledger_id=? AND name=? AND is_active=1").bind(ledgerId, String(body.category)).first<{ name: string; builtinKey: string | null }>();
    const income = body.incomeCategory == null
      ? null
      : await db.prepare("SELECT name,builtin_key builtinKey FROM income_categories WHERE ledger_id=? AND name=? AND is_active=1").bind(ledgerId, String(body.incomeCategory)).first<{ name: string; builtinKey: string | null }>();
    if (body.category != null && !expense) throw new Error("消费分类不存在");
    if (body.incomeCategory != null && !income) throw new Error("收入分类不存在");
    const fields: string[] = [];
    const values: unknown[] = [];
    if (expense) {
      fields.push("category=?", "category_dynamic=?");
      values.push(expense.builtinKey, expense.name);
    }
    if (income) {
      fields.push("income_category=?", "income_category_dynamic=?");
      values.push(income.builtinKey, income.name);
    }
    if (body.mood != null) {
      fields.push("mood=?");
      values.push(body.mood);
    }
    values.push(ledgerId, ...ids);
    const result = await db
      .prepare(`UPDATE transactions SET ${fields.join(",")},updated_at=CURRENT_TIMESTAMP WHERE ledger_id=? AND id IN (${placeholders})`)
      .bind(...values)
      .run();
    await recordAuditEvent({
      ownerId,
      eventType: "transaction.bulk_update",
      subjectType: "ledger",
      subjectId: ledgerId,
      requestId: requestIdFromRequest(request),
      metadata: { requested: ids.length, updated: Number(result.meta.changes ?? 0) },
    });
    return privateJson({ ok: true, updated: Number(result.meta.changes ?? 0) });
  } catch (error) {
    return accessErrorResponse(error, "批量修改流水失败", request);
  }
}
