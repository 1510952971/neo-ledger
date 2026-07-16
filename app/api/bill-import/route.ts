import { NextResponse } from "next/server";
import { ensureDb, evaluateAchievements, getDbBinding } from "../../../db";
import { categoryFor, matchStatementAccount } from "../../bill-import-core.js";
import { convertCurrencyCents, localDateTimeToUtc } from "../../time-money.js";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";

type Currency = "CNY" | "USD" | "JPY" | "EUR";
type ParsedBill = {
  occurredAt: string;
  merchant: string;
  amount: number;
  type: "支出" | "收入";
  source: string;
  sourceName: string;
  sourceCategory: string;
  category: string;
  incomeCategory: string;
  paymentMethod: string;
  status: string;
  externalId: string;
  currency: Currency;
  originalTimezone?: string;
  accountId?: number;
  accountName?: string;
  importKey?: string;
  possibleDuplicate?: boolean;
};

type AccountRow = {
  id: number;
  name: string;
  type: "资产" | "负债";
  currency: Currency;
};

type ExistingRow = {
  title: string;
  amount: number;
  type: string;
  occurredAt: string;
  offlineId: string | null;
};

const BLACKLIST = [
  "涂改",
  "编造",
  "失效",
  "快捷支付",
  "统计逻辑",
  "不一致",
  "通讯故障",
  "不符时",
  "不计收支",
  "本明细为",
  "白条相关",
] as const;
const DATE_TIME = /^20\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const CURRENCIES = new Set<Currency>(["CNY", "USD", "JPY", "EUR"]);
const MAX_IMPORT_ITEMS = 20_000;
const LEGACY_CATEGORIES = new Set(["餐饮", "交通", "购物", "咖啡", "娱乐"]);
const LEGACY_INCOME_CATEGORIES = new Set([
  "薪资发放",
  "理财收益",
  "兼职外快",
  "其它收入",
]);

const cleanText = (value: unknown, maxLength: number) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

async function importKeyFor(item: ParsedBill) {
  const identity = item.externalId
    ? `${item.source}|${item.externalId}`
    : `${item.source}|${item.occurredAt}|${item.type}|${item.amount.toFixed(2)}|${item.merchant}|${item.paymentMethod}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity),
  );
  return `import:${[...new Uint8Array(digest)]
    .slice(0, 16)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function normalizeItem(value: ParsedBill): ParsedBill | null {
  const occurredAt = cleanText(value.occurredAt, 19);
  const merchant = cleanText(value.merchant, 80);
  const amount = Number(value.amount);
  if (
    !DATE_TIME.test(occurredAt) ||
    !merchant ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 100_000_000
  )
    return null;
  return {
    occurredAt,
    merchant,
    amount,
    type: value.type === "收入" ? "收入" : "支出",
    source: cleanText(value.source, 32) || "generic",
    sourceName: cleanText(value.sourceName, 32) || "通用账单",
    sourceCategory: cleanText(value.sourceCategory, 40),
    category: cleanText(value.category, 20) || categoryFor(merchant),
    incomeCategory: cleanText(value.incomeCategory, 20) || "其它收入",
    paymentMethod: cleanText(value.paymentMethod, 60) || "待选择账户",
    status: cleanText(value.status, 24),
    externalId: cleanText(value.externalId, 120),
    currency: CURRENCIES.has(value.currency) ? value.currency : "CNY",
    originalTimezone: cleanText(value.originalTimezone, 50) || "Asia/Shanghai",
    accountId: Number(value.accountId) || 0,
    accountName: cleanText(value.accountName, 40),
  };
}

async function loadAccounts(ledgerId: number) {
  return (
    await getDbBinding()
      .prepare(
        "SELECT id,name,type,currency FROM accounts WHERE ledger_id=? ORDER BY id",
      )
      .bind(ledgerId)
      .all<AccountRow>()
  ).results;
}

async function loadExisting(
  ledgerId: number,
  items: ParsedBill[],
): Promise<ExistingRow[]> {
  if (!items.length) return [];
  const dates = items
    .map((item) => localDateTimeToUtc(item.occurredAt, item.originalTimezone))
    .sort();
  return (
    await getDbBinding()
      .prepare(
        "SELECT title,amount,type,occurred_at AS occurredAt,offline_id AS offlineId FROM transactions WHERE ledger_id=? AND occurred_at>=? AND occurred_at<=?",
      )
      .bind(ledgerId, dates[0], dates.at(-1))
      .all<ExistingRow>()
  ).results;
}

const exactComposite = (item: ParsedBill, cents = Math.round(item.amount * 100)) =>
  `${item.merchant.slice(0, 40)}|${cents}|${item.type}|${item.occurredAt}`;
const amountMoment = (item: ParsedBill, cents = Math.round(item.amount * 100)) =>
  `${cents}|${item.type}|${item.occurredAt.slice(0, 16)}`;

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      ledgerId?: number;
      items?: ParsedBill[];
    };
    const ledgerId = Number(body.ledgerId || 1);
    if (!Number.isInteger(ledgerId) || ledgerId <= 0)
      throw new Error("账本不存在");
    await claimAndRequireLedger(request, ledgerId);
    const incoming = body.items ?? [];
    const truncated = Math.max(0, incoming.length - MAX_IMPORT_ITEMS);
    const normalized = incoming
      .slice(0, MAX_IMPORT_ITEMS)
      .map(normalizeItem)
      .filter((item): item is ParsedBill => Boolean(item));
    if (!normalized.length) throw new Error("没有识别到有效流水");
    const accounts = await loadAccounts(ledgerId);
    if (!accounts.length) throw new Error("请先创建账户");
    const existing = await loadExisting(ledgerId, normalized);
    const existingImportKeys = new Set(
      existing.map((item) => item.offlineId).filter(Boolean),
    );
    const existingComposites = new Set(
      existing.map(
        (item) => `${item.title}|${item.amount}|${item.type}|${item.occurredAt}`,
      ),
    );
    const existingAmountMoments = new Set(
      existing.map(
        (item) =>
          `${item.amount}|${item.type}|${item.occurredAt.slice(0, 16)}`,
      ),
    );
    const seenImportKeys = new Set<string>();
    const seenComposites = new Set<string>();
    const items: ParsedBill[] = [];
    let duplicates = 0,
      possibleDuplicates = 0,
      unmapped = 0;
    for (const item of normalized) {
      const importKey = await importKeyFor(item);
      const composite = exactComposite(item);
      if (
        existingImportKeys.has(importKey) ||
        existingComposites.has(composite) ||
        seenImportKeys.has(importKey) ||
        seenComposites.has(composite)
      ) {
        duplicates += 1;
        continue;
      }
      seenImportKeys.add(importKey);
      seenComposites.add(composite);
      const requestedAccount = accounts.find(
        (account) => account.id === item.accountId,
      );
      const account =
        requestedAccount ??
        matchStatementAccount(item.paymentMethod, item.source, accounts);
      const possibleDuplicate = existingAmountMoments.has(amountMoment(item));
      if (possibleDuplicate) possibleDuplicates += 1;
      if (!account) unmapped += 1;
      items.push({
        ...item,
        accountId: account?.id ?? 0,
        accountName: account?.name ?? "请选择账户",
        importKey,
        possibleDuplicate,
      });
    }
    if (!items.length) throw new Error("这些流水都已经导入过了");
    return NextResponse.json({
      items,
      duplicates,
      possibleDuplicates,
      unmapped,
      detected: normalized.length,
      received: incoming.length,
      unconfirmed: Math.min(incoming.length, MAX_IMPORT_ITEMS) - normalized.length,
      truncated,
    });
  } catch (error) {
    return accessErrorResponse(error, "解析失败");
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      ledgerId?: number;
      items?: ParsedBill[];
    };
    const ledgerId = Number(body.ledgerId || 1);
    await claimAndRequireLedger(request, ledgerId);
    if ((body.items?.length ?? 0) > MAX_IMPORT_ITEMS)
      throw new Error(`一次最多导入 ${MAX_IMPORT_ITEMS} 笔，请拆分文件后重试`);
    const items = (body.items ?? [])
      .map(normalizeItem)
      .filter((item): item is ParsedBill => Boolean(item));
    if (!items.length) throw new Error("没有待导入流水");
    const db = getDbBinding();
    const [accounts, categoryRows, incomeCategoryRows, existing] =
      await Promise.all([
        loadAccounts(ledgerId),
        db
          .prepare(
            "SELECT name,builtin_key AS builtinKey FROM expense_categories WHERE ledger_id=? AND is_active=1 ORDER BY sort_order,id",
          )
          .bind(ledgerId)
          .all<{ name: string; builtinKey: string | null }>(),
        db
          .prepare(
            "SELECT name,builtin_key AS builtinKey FROM income_categories WHERE ledger_id=? AND is_active=1 ORDER BY sort_order,id",
          )
          .bind(ledgerId)
          .all<{ name: string; builtinKey: string | null }>(),
        loadExisting(ledgerId, items),
      ]);
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const existingImportKeys = new Set(
      existing.map((item) => item.offlineId).filter(Boolean),
    );
    const existingComposites = new Set(
      existing.map(
        (item) => `${item.title}|${item.amount}|${item.type}|${item.occurredAt}`,
      ),
    );
    const statements = [];
    let imported = 0,
      duplicates = 0,
      skipped = 0;
    for (const item of items) {
      const account = accountMap.get(Number(item.accountId));
      if (!account) {
        skipped += 1;
        continue;
      }
      const originalAmount = Math.round(item.amount * 100);
      const conversion = convertCurrencyCents(
        originalAmount,
        item.currency,
        account.currency,
      );
      const amount = conversion.convertedAmount;
      const importKey = item.importKey || (await importKeyFor(item));
      const composite = exactComposite(item, amount);
      if (
        existingImportKeys.has(importKey) ||
        existingComposites.has(composite)
      ) {
        duplicates += 1;
        continue;
      }
      existingImportKeys.add(importKey);
      existingComposites.add(composite);
      const desiredCategory =
        categoryRows.results.find((row) => row.name === item.category) ??
        categoryRows.results.find(
          (row) => row.builtinKey === categoryFor(item.merchant, item.sourceCategory),
        ) ??
        categoryRows.results[0];
      const desiredIncomeCategory =
        incomeCategoryRows.results.find(
          (row) => row.name === item.incomeCategory,
        ) ??
        incomeCategoryRows.results.find(
          (row) => row.builtinKey === item.incomeCategory,
        ) ??
        incomeCategoryRows.results[0];
      if (!desiredCategory || !desiredIncomeCategory) {
        skipped += 1;
        continue;
      }
      const legacyCategory = LEGACY_CATEGORIES.has(
        desiredCategory.builtinKey ?? "",
      )
        ? desiredCategory.builtinKey
        : "购物";
      const legacyIncomeCategory = LEGACY_INCOME_CATEGORIES.has(
        desiredIncomeCategory.builtinKey ?? "",
      )
        ? desiredIncomeCategory.builtinKey
        : "其它收入";
      statements.push(
        db
          .prepare(
            "INSERT INTO transactions(ledger_id,title,amount,type,mood,category,category_dynamic,income_category,income_category_dynamic,account_id,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,occurred_at,offline_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            ledgerId,
            item.merchant.slice(0, 40),
            amount,
            item.type,
            item.type === "支出" ? "刚需" : null,
            item.type === "支出" ? legacyCategory : null,
            item.type === "支出" ? desiredCategory.name : null,
            item.type === "收入" ? legacyIncomeCategory : null,
            item.type === "收入" ? desiredIncomeCategory.name : null,
            account.id,
            account.currency,
            originalAmount,
            item.currency,
            conversion.exchangeRateMicros,
            item.originalTimezone,
            localDateTimeToUtc(item.occurredAt, item.originalTimezone),
            importKey,
          ),
      );
      statements.push(
        db
          .prepare(
            "UPDATE accounts SET current_balance=current_balance+? WHERE id=?",
          )
          .bind(item.type === "支出" ? -amount : amount, account.id),
      );
      imported += 1;
    }
    if (!imported)
      throw new Error(
        duplicates ? "这些流水都已经导入过了" : "请先为流水选择有效账户",
      );
    for (let index = 0; index < statements.length; index += 160)
      await db.batch(statements.slice(index, index + 160));
    await evaluateAchievements(ledgerId);
    return NextResponse.json({ ok: true, imported, duplicates, skipped });
  } catch (error) {
    return accessErrorResponse(error, "导入失败");
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const ledgerId = Number(
      new URL(request.url).searchParams.get("ledger") || 1,
    );
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const where = BLACKLIST.map(() => "title LIKE ?").join(" OR ");
    const bindings = BLACKLIST.map((keyword) => `%${keyword}%`);
    const rows = await db
      .prepare(
        `SELECT id,amount,type,account_id AS accountId FROM transactions WHERE ledger_id=? AND (${where})`,
      )
      .bind(ledgerId, ...bindings)
      .all<{ id: number; amount: number; type: string; accountId: number }>();
    if (!rows.results.length)
      return NextResponse.json({ ok: true, deleted: 0 });
    const statements = [];
    for (const row of rows.results) {
      statements.push(
        db
          .prepare(
            "UPDATE accounts SET current_balance=current_balance+? WHERE id=?",
          )
          .bind(row.type === "支出" ? row.amount : -row.amount, row.accountId),
        db
          .prepare("DELETE FROM side_hustle_deductions WHERE transaction_id=?")
          .bind(row.id),
        db.prepare("DELETE FROM transactions WHERE id=?").bind(row.id),
      );
    }
    for (let index = 0; index < statements.length; index += 160)
      await db.batch(statements.slice(index, index + 160));
    return NextResponse.json({ ok: true, deleted: rows.results.length });
  } catch (error) {
    return accessErrorResponse(error, "清理失败");
  }
}
