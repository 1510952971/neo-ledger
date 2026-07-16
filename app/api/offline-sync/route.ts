import { NextResponse } from "next/server";
import { ensureDb, evaluateAchievements, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";
import { localDateTimeToUtc } from "../../time-money.js";
const moods = ["悦己", "刚需", "冲动"];
export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      items?: Record<string, unknown>[];
    };
    const items = (body.items || []).slice(0, 50),
      db = getDbBinding(),
      synced: string[] = [];
    for (const item of items) {
      const offlineId = String(item.offlineId || "").slice(0, 80),
        ledgerId = Number(item.ledgerId || 1),
        accountId = Number(item.accountId),
        amount = Math.round(Number(item.amount) * 100),
        type = item.type === "收入" ? "收入" : "支出";
      if (!offlineId || !amount || !accountId) continue;
      await claimAndRequireLedger(request, ledgerId);
      const exists = await db
        .prepare("SELECT id FROM transactions WHERE offline_id=?")
        .bind(offlineId)
        .first();
      if (exists) {
        synced.push(offlineId);
        continue;
      }
      const account = await db
        .prepare("SELECT id,currency FROM accounts WHERE id=? AND ledger_id=?")
        .bind(accountId, ledgerId)
        .first<{ id: number; currency: string }>();
      if (!account) continue;
      const mood = moods.includes(String(item.mood))
          ? String(item.mood)
          : "刚需",
        requestedCategory = String(item.category || ""),
        requestedIncomeCategory = String(item.incomeCategory || ""),
        originalTimezone = String(item.originalTimezone || "Asia/Shanghai"),
        occurredAt = localDateTimeToUtc(
          String(item.occurredAt || new Date().toISOString()),
          originalTimezone,
        );
      const configuredCategory = await db
        .prepare(
          "SELECT name,builtin_key builtinKey FROM expense_categories WHERE ledger_id=? AND is_active=1 ORDER BY CASE WHEN name=? THEN 0 ELSE 1 END,sort_order,id LIMIT 1",
        )
        .bind(ledgerId, requestedCategory)
        .first<{ name: string; builtinKey: string | null }>();
      if (type === "支出" && !configuredCategory) continue;
      const configuredIncomeCategory = await db
        .prepare(
          "SELECT name,builtin_key builtinKey FROM income_categories WHERE ledger_id=? AND is_active=1 ORDER BY CASE WHEN name=? THEN 0 ELSE 1 END,sort_order,id LIMIT 1",
        )
        .bind(ledgerId, requestedIncomeCategory)
        .first<{ name: string; builtinKey: string | null }>();
      if (type === "收入" && !configuredIncomeCategory) continue;
      const splitMode = type === "支出" ? String(item.splitMode || "") : "";
      const splitWithMemberId = Number(item.splitWithMemberId || 0) || null;
      const mySharePercent = Math.max(0, Math.min(100, Number(item.mySharePercent || 100)));
      const me = splitWithMemberId
        ? await db.prepare("SELECT id FROM members WHERE ledger_id=? AND is_me=1").bind(ledgerId).first<{ id: number }>()
        : null;
      const results = await db.batch([
        db
          .prepare(
            "INSERT INTO transactions(ledger_id,title,amount,type,mood,category,category_dynamic,income_category,income_category_dynamic,account_id,paid_by_member_id,split_with_member_id,split_mode,my_share_percent,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,is_side_hustle,occurred_at,offline_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1000000,?,?,?,?)",
          )
          .bind(
            ledgerId,
            String(item.title || "离线记账").slice(0, 40),
            amount,
            type,
            type === "支出" ? mood : null,
            type === "支出" ? configuredCategory?.builtinKey : null,
            type === "支出" ? configuredCategory?.name : null,
            type === "收入" ? configuredIncomeCategory?.builtinKey : null,
            type === "收入" ? configuredIncomeCategory?.name : null,
            account.id,
            splitWithMemberId
              ? splitMode === "全额由对方支付"
                ? splitWithMemberId
                : me?.id ?? null
              : null,
            splitWithMemberId,
            splitWithMemberId ? splitMode : null,
            splitWithMemberId ? mySharePercent : 100,
            account.currency,
            amount,
            account.currency,
            originalTimezone,
            type === "收入" && item.isSideHustle ? 1 : 0,
            occurredAt,
            offlineId,
          ),
        db
          .prepare(
            "UPDATE accounts SET current_balance=current_balance+? WHERE id=?",
          )
          .bind(type === "支出" ? -amount : amount, account.id),
      ]);
      if (type === "收入" && item.isSideHustle && item.isBusinessExpense) {
        const transactionId = Number(results[0].meta.last_row_id);
        await db.prepare("INSERT INTO side_hustle_deductions(ledger_id,transaction_id,amount,note) VALUES(?,?,?,'副业经营成本')").bind(ledgerId, transactionId, amount).run();
      }
      synced.push(offlineId);
      await evaluateAchievements(ledgerId);
    }
    return NextResponse.json({ ok: true, synced, truncated: Math.max(0, (body.items?.length ?? 0) - items.length) });
  } catch (error) {
    return accessErrorResponse(error, "离线同步失败");
  }
}
