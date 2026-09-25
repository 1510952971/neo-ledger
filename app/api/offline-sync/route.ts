import { NextResponse } from "next/server";
import { ensureDb, evaluateAchievements, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";
import { localDateTimeToUtc } from "../../time-money.js";
import { MAX_PROTOCOL_BODY_BYTES, readJsonWithLimit } from "../../request-limits";
import {
  isSplitMode,
  transactionAccountDelta,
} from "../../split-core.js";
import { normalizeScreenshotRecognition } from "../../screenshot-recognition-core.js";

function privateJson(body: unknown) {
  const headers = new Headers({
    "Cache-Control": "no-store, private, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  return NextResponse.json(body, { headers });
}

const moods = ["悦己", "刚需", "冲动"];
const currencies = new Set(["CNY", "USD", "JPY", "EUR"]);
export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await readJsonWithLimit<{
      items?: Record<string, unknown>[];
    }>(request, MAX_PROTOCOL_BODY_BYTES);
    const items = (body.items || []).slice(0, 50),
      db = getDbBinding(),
      synced: string[] = [];
    for (const item of items) {
      const offlineId = String(item.offlineId || "").slice(0, 80),
        ledgerId = Number(item.ledgerId || 1),
        accountId = Number(item.accountId),
        requestedAmount = Math.round(Number(item.amount) * 100),
        type = item.type === "收入" ? "收入" : "支出";
      if (!offlineId || !accountId) continue;
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
      const originalCurrency = String(item.originalCurrency || account.currency).toUpperCase();
      const originalAmountMajor = Number(
        item.originalAmount ?? (requestedAmount / 100),
      );
      const exchangeRate = Number(item.exchangeRate ?? 1);
      if (!currencies.has(originalCurrency) ||
          !Number.isFinite(originalAmountMajor) || originalAmountMajor <= 0 ||
          !Number.isFinite(exchangeRate) || exchangeRate <= 0 || exchangeRate > 1_000_000) {
        throw new Error("原币金额或汇率无效");
      }
      const amount = Math.round(originalAmountMajor * exchangeRate * 100);
      if (!amount || amount > 99999999999) throw new Error("记账金额超出范围");
      const originalAmountCents = Math.round(originalAmountMajor * 100);
      const exchangeRateMicros = Math.round(exchangeRate * 1_000_000);
      const mood = moods.includes(String(item.mood))
          ? String(item.mood)
          : "刚需",
        note = String(item.note || "").trim().slice(0, 240),
        tags = [...new Set((Array.isArray(item.tags) ? item.tags : [])
          .map((tag) => String(tag).trim().slice(0, 24))
          .filter(Boolean))].slice(0, 12),
        reimbursable = item.reimbursable === true || item.reimbursable === 1,
        discountAmount = Math.max(0, Math.round(Number(item.discountAmount || 0) * 100)),
        excludeFromBudget = item.excludeFromBudget === true || item.excludeFromBudget === 1,
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
      const partner = splitWithMemberId
        ? await db
            .prepare(
              "SELECT id FROM members WHERE id=? AND ledger_id=? AND is_me=0",
            )
            .bind(splitWithMemberId, ledgerId)
            .first<{ id: number }>()
        : null;
      if (splitWithMemberId && (!partner || !isSplitMode(splitMode)))
        throw new Error("离线账单的分账搭子不存在或分账方式无效");
      const shared = type === "支出" && Boolean(partner);
      const recognition = normalizeScreenshotRecognition(item);
      const me = shared
        ? await db.prepare("SELECT id FROM members WHERE ledger_id=? AND is_me=1").bind(ledgerId).first<{ id: number }>()
        : null;
      if (shared && !me) throw new Error("当前账本缺少“我”的分账身份");
      const results = await db.batch([
        db
          .prepare(
            "INSERT INTO transactions(ledger_id,title,note,tags_json,amount,type,mood,category,category_dynamic,income_category,income_category_dynamic,account_id,paid_by_member_id,split_with_member_id,split_mode,my_share_percent,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,is_side_hustle,reimbursable,discount_amount,exclude_from_budget,source,recognition_text,recognition_completeness,recognition_corrections_json,occurred_at,offline_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            ledgerId,
            String(item.title || "离线记账").slice(0, 40),
            note,
            JSON.stringify(tags),
            amount,
            type,
            type === "支出" ? mood : null,
            type === "支出" ? configuredCategory?.builtinKey : null,
            type === "支出" ? configuredCategory?.name : null,
            type === "收入" ? configuredIncomeCategory?.builtinKey : null,
            type === "收入" ? configuredIncomeCategory?.name : null,
            account.id,
            shared
              ? splitMode === "全额由对方支付"
                ? partner?.id
                : me?.id ?? null
              : null,
            shared ? partner?.id : null,
            shared ? splitMode : null,
            shared ? mySharePercent : 100,
            account.currency,
            originalAmountCents,
            originalCurrency,
            exchangeRateMicros,
            originalTimezone,
            type === "收入" && item.isSideHustle ? 1 : 0,
            reimbursable ? 1 : 0,
            discountAmount,
            excludeFromBudget ? 1 : 0,
            recognition.source,
            recognition.recognitionText,
            recognition.recognitionCompleteness,
            recognition.recognitionCorrectionsJson,
            occurredAt,
            offlineId,
          ),
        db
          .prepare(
            "UPDATE accounts SET current_balance=current_balance+? WHERE id=?",
          )
          .bind(
            transactionAccountDelta(
              type,
              amount,
              shared ? splitMode : null,
              shared ? (partner?.id ?? 0) : 0,
            ),
            account.id,
          ),
      ]);
      if (type === "收入" && item.isSideHustle && item.isBusinessExpense) {
        const transactionId = Number(results[0].meta.last_row_id);
        await db.prepare("INSERT INTO side_hustle_deductions(ledger_id,transaction_id,amount,note) VALUES(?,?,?,'副业经营成本')").bind(ledgerId, transactionId, amount).run();
      }
      synced.push(offlineId);
      await evaluateAchievements(ledgerId);
    }
    return privateJson({ ok: true, synced, truncated: Math.max(0, (body.items?.length ?? 0) - items.length) });
  } catch (error) {
    return accessErrorResponse(error, "离线同步失败", request);
  }
}
