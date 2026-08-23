import { NextResponse } from "next/server";
import { ensureDb, evaluateAchievements, getDbBinding } from "../../../db";
import { categoryFor, matchStatementAccount } from "../../bill-import-core.js";
import { convertCurrencyCents, localDateTimeToUtc } from "../../time-money.js";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";
import { MAX_ACCOUNT_COUNT } from "../../account-limits";
import { MAX_CATEGORY_COUNT } from "../../category-limits";
import { recordAuditEvent, requestIdFromRequest } from "../../audit-log";
import {
  MAX_BILL_IMPORT_BODY_BYTES,
  readJsonWithLimit,
} from "../../request-limits";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

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

type CategoryRow = {
  name: string;
  builtinKey: string | null;
};

type QueryRows<T> = {
  results: T[];
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
// Duplicate detection must not materialize an entire multi-year ledger just
// because one uploaded file spans a broad date range. If the candidate set is
// larger than this bound, fail closed and ask the user to split the import;
// silently truncating candidates could create duplicate financial records.
const MAX_IMPORT_EXISTING_ROWS = 50_000;
// The legacy blacklist cleanup is intentionally bounded as well. A caller
// must use tracked import batches for larger reversals instead of triggering a
// long, unreviewable delete transaction over an entire ledger.
const MAX_IMPORT_CLEANUP_ROWS = 20_000;
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

async function loadAccounts(ledgerId: number): Promise<AccountRow[]> {
  return (
    await getDbBinding()
      .prepare(
        "SELECT id,name,type,currency FROM accounts WHERE ledger_id=? ORDER BY id LIMIT ?",
      )
      .bind(ledgerId, MAX_ACCOUNT_COUNT)
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
  const db = getDbBinding();
  const count = await db
    .prepare(
      "SELECT COUNT(*) count FROM transactions WHERE ledger_id=? AND occurred_at>=? AND occurred_at<=?",
    )
    .bind(ledgerId, dates[0], dates.at(-1))
    .first<{ count: number }>();
  if (Number(count?.count ?? 0) > MAX_IMPORT_EXISTING_ROWS)
    throw new Error("导入时间范围内已有流水过多，请缩小时间范围后分批导入");
  return (
    await db
      .prepare(
        "SELECT title,amount,type,occurred_at AS occurredAt,offline_id AS offlineId FROM transactions WHERE ledger_id=? AND occurred_at>=? AND occurred_at<=? ORDER BY occurred_at,id LIMIT ?",
      )
      .bind(ledgerId, dates[0], dates.at(-1), MAX_IMPORT_EXISTING_ROWS)
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
    const body = await readJsonWithLimit<{
      ledgerId?: number;
      items?: ParsedBill[];
    }>(request, MAX_BILL_IMPORT_BODY_BYTES);
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
        matchStatementAccount(
          item.paymentMethod,
          item.source,
          accounts,
          item.currency,
        );
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
    return privateJson({
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
    return accessErrorResponse(error, "解析失败", request);
  }
}

export async function PUT(request: Request) {
  let createdBatchId: string | null = null;
  try {
    await ensureDb();
    const body = await readJsonWithLimit<{
      ledgerId?: number;
      items?: ParsedBill[];
    }>(request, MAX_BILL_IMPORT_BODY_BYTES);
    const ledgerId = Number(body.ledgerId || 1);
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    if ((body.items?.length ?? 0) > MAX_IMPORT_ITEMS)
      throw new Error(`一次最多导入 ${MAX_IMPORT_ITEMS} 笔，请拆分文件后重试`);
    const items = (body.items ?? [])
      .map(normalizeItem)
      .filter((item): item is ParsedBill => Boolean(item));
    if (!items.length) throw new Error("没有待导入流水");
    const db = getDbBinding();
    const accountsPromise: Promise<AccountRow[]> = loadAccounts(ledgerId);
    const categoryRowsPromise: Promise<QueryRows<CategoryRow>> = db
      .prepare(
        "SELECT name,builtin_key AS builtinKey FROM expense_categories WHERE ledger_id=? AND is_active=1 ORDER BY sort_order,id LIMIT ?",
      )
      .bind(ledgerId, MAX_CATEGORY_COUNT)
      .all<CategoryRow>();
    const incomeCategoryRowsPromise: Promise<QueryRows<CategoryRow>> = db
      .prepare(
        "SELECT name,builtin_key AS builtinKey FROM income_categories WHERE ledger_id=? AND is_active=1 ORDER BY sort_order,id LIMIT ?",
      )
      .bind(ledgerId, MAX_CATEGORY_COUNT)
      .all<CategoryRow>();
    const existingPromise: Promise<ExistingRow[]> = loadExisting(ledgerId, items);
    const [accounts, categoryRows, incomeCategoryRows, existing] =
      await Promise.all([
        accountsPromise,
        categoryRowsPromise,
        incomeCategoryRowsPromise,
        existingPromise,
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
    const batchId = crypto.randomUUID();
    createdBatchId = batchId;
    await db.prepare("INSERT INTO import_batches(id,owner_id,ledger_id,source_label) VALUES(?,?,?,'账单导入')").bind(batchId, ownerId, ledgerId).run();
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
        db.prepare("INSERT INTO import_batch_items(batch_id,transaction_id,offline_id,imported_updated_at) SELECT ?,id,offline_id,updated_at FROM transactions WHERE ledger_id=? AND offline_id=?").bind(batchId, ledgerId, importKey),
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
      {
        await db.prepare("DELETE FROM import_batches WHERE id=?").bind(batchId).run();
        throw new Error(duplicates ? "这些流水都已经导入过了" : "请先为流水选择有效账户");
      }
    for (let index = 0; index < statements.length; index += 159)
      await db.batch(statements.slice(index, index + 159));
    await evaluateAchievements(ledgerId);
    await db.prepare("UPDATE import_batches SET imported_count=?,status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?").bind(imported, batchId, ownerId).run();
    await recordAuditEvent({ ownerId, eventType: "data.import_batch", subjectType: "import_batch", subjectId: batchId, requestId: requestIdFromRequest(request), metadata: { ledgerId, imported, duplicates, skipped } });
    return privateJson({ ok: true, batchId, imported, duplicates, skipped });
  } catch (error) {
    if (createdBatchId) {
      try {
        const db = getDbBinding();
        const count = await db.prepare("SELECT COUNT(*) count FROM import_batch_items WHERE batch_id=?").bind(createdBatchId).first<{ count: number }>();
        await db.prepare("UPDATE import_batches SET imported_count=?,status='failed',completed_at=CURRENT_TIMESTAMP WHERE id=? AND status='importing'").bind(Number(count?.count ?? 0), createdBatchId).run();
      } catch {}
    }
    return accessErrorResponse(error, "导入失败", request);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const url = new URL(request.url);
    const ledgerId = Number(url.searchParams.get("ledger") || 1);
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const batchId = url.searchParams.get("batchId");
    if (batchId) {
      const resume = url.searchParams.get("resume") === "1";
      const batch = await db.prepare("SELECT id,status,imported_count importedCount,undo_started_at undoStartedAt,undo_lock_id undoLockId FROM import_batches WHERE id=? AND owner_id=? AND ledger_id=?").bind(batchId, ownerId, ledgerId).first<{ id: string; status: string; importedCount: number; undoStartedAt: string | null; undoLockId: string | null }>();
      if (!batch) throw new Error("导入批次不存在");
      if (batch.status === "undone") return privateJson({ ok: true, undone: 0, alreadyUndone: true });
      const resuming = batch.status === "undoing";
      if (resuming) {
        const startedAt = batch.undoStartedAt ? Date.parse(batch.undoStartedAt.replace(" ", "T") + (batch.undoStartedAt.includes("Z") ? "" : "Z")) : NaN;
        if (!resume || !Number.isFinite(startedAt) || startedAt > Date.now() - 10 * 60_000)
          return privateJson({ error: "该批次正在撤销；若进程已中断，请 10 分钟后使用恢复撤销" }, { status: 409 });
      } else if (!new Set(["completed", "failed"]).has(batch.status)) throw new Error("导入批次尚未完成，不能撤销");
      const lockId = crypto.randomUUID();
      const claimed = resuming
        ? await db.prepare("UPDATE import_batches SET undo_started_at=CURRENT_TIMESTAMP,undo_lock_id=? WHERE id=? AND owner_id=? AND ledger_id=? AND status='undoing' AND undo_lock_id=?").bind(lockId, batchId, ownerId, ledgerId, batch.undoLockId).run()
        : await db.prepare("UPDATE import_batches SET status='undoing',undo_started_at=CURRENT_TIMESTAMP,undo_lock_id=? WHERE id=? AND owner_id=? AND ledger_id=? AND status=?").bind(lockId, batchId, ownerId, ledgerId, batch.status).run();
      if (!Number(claimed.meta.changes)) {
        const current = await db.prepare("SELECT status FROM import_batches WHERE id=? AND owner_id=? AND ledger_id=?").bind(batchId, ownerId, ledgerId).first<{ status: string }>();
        if (current?.status === "undone") return privateJson({ ok: true, undone: 0, alreadyUndone: true });
        if (current?.status === "undoing") return privateJson({ error: "该批次正在撤销，请稍后刷新结果" }, { status: 409 });
        throw new Error("导入批次状态已变化，请刷新后重试");
      }
      const changed = await db.prepare("SELECT COUNT(*) count FROM import_batch_items i JOIN transactions t ON t.id=i.transaction_id WHERE i.batch_id=? AND t.updated_at<>i.imported_updated_at").bind(batchId).first<{ count: number }>();
      if (Number(changed?.count ?? 0) > 0) {
        if (!resuming) await db.prepare("UPDATE import_batches SET status=?,undo_started_at=NULL,undo_lock_id=NULL WHERE id=? AND owner_id=? AND status='undoing'").bind(batch.status, batchId, ownerId).run();
        throw new Error("批次中的流水已被修改或删除，不能整批撤销");
      }
      const importedRows = await db.prepare("SELECT t.id,t.amount,t.type,t.account_id accountId,t.updated_at updatedAt FROM import_batch_items i JOIN transactions t ON t.id=i.transaction_id WHERE i.batch_id=? ORDER BY t.id").bind(batchId).all<{ id: number; amount: number; type: string; accountId: number; updatedAt: string }>();
      const undoStatements = [];
      for (const row of importedRows.results) undoStatements.push(
        db.prepare("UPDATE accounts SET current_balance=current_balance+? WHERE id=? AND ledger_id=? AND EXISTS (SELECT 1 FROM transactions WHERE id=? AND ledger_id=? AND updated_at=?)").bind(row.type === "支出" ? row.amount : -row.amount, row.accountId, ledgerId, row.id, ledgerId, row.updatedAt),
        db.prepare("DELETE FROM transaction_reconciliation WHERE transaction_id=? AND EXISTS (SELECT 1 FROM transactions WHERE id=? AND ledger_id=? AND updated_at=?)").bind(row.id, row.id, ledgerId, row.updatedAt),
        db.prepare("DELETE FROM side_hustle_deductions WHERE transaction_id=? AND EXISTS (SELECT 1 FROM transactions WHERE id=? AND ledger_id=? AND updated_at=?)").bind(row.id, row.id, ledgerId, row.updatedAt),
        db.prepare("DELETE FROM transactions WHERE id=? AND ledger_id=? AND updated_at=?").bind(row.id, ledgerId, row.updatedAt),
      );
      for (let index = 0; index < undoStatements.length; index += 160) {
        const results = await db.batch(undoStatements.slice(index, index + 160));
        for (let resultIndex = 3; resultIndex < results.length; resultIndex += 4)
          if (Number(results[resultIndex]?.meta.changes ?? 0) !== 1)
            throw new Error("批次中的流水版本已变化，撤销已暂停，请刷新后处理");
      }
      const finished = await db.prepare("UPDATE import_batches SET status='undone',undone_at=CURRENT_TIMESTAMP,undo_started_at=NULL,undo_lock_id=NULL WHERE id=? AND owner_id=? AND status='undoing' AND undo_lock_id=?").bind(batchId, ownerId, lockId).run();
      if (!Number(finished.meta.changes)) return privateJson({ error: "批次撤销状态已变化，请刷新后重试" }, { status: 409 });
      await recordAuditEvent({ ownerId, eventType: "data.import_batch_undo", subjectType: "import_batch", subjectId: batchId, requestId: requestIdFromRequest(request), metadata: { ledgerId, undone: importedRows.results.length, resumed: resuming } });
      return privateJson({ ok: true, undone: importedRows.results.length, resumed: resuming });
    }
    const where = BLACKLIST.map(() => "title LIKE ?").join(" OR ");
    const bindings = BLACKLIST.map((keyword) => `%${keyword}%`);
    const matchingCount = await db
      .prepare(
        `SELECT COUNT(*) count FROM transactions WHERE ledger_id=? AND (${where})`,
      )
      .bind(ledgerId, ...bindings)
      .first<{ count: number }>();
    if (Number(matchingCount?.count ?? 0) > MAX_IMPORT_CLEANUP_ROWS)
      throw new Error("待清理流水超过 20,000 笔，请按导入批次分批撤销");
    const rows = await db
      .prepare(
        `SELECT id,amount,type,account_id AS accountId,updated_at updatedAt FROM transactions WHERE ledger_id=? AND (${where}) ORDER BY id LIMIT ?`,
      )
      .bind(ledgerId, ...bindings, MAX_IMPORT_CLEANUP_ROWS)
      .all<{ id: number; amount: number; type: string; accountId: number; updatedAt: string }>();
    if (!rows.results.length)
      return privateJson({ ok: true, deleted: 0 });
    const statements = [];
    for (const row of rows.results) {
      statements.push(
        db
          .prepare(
            "UPDATE accounts SET current_balance=current_balance+? WHERE id=? AND ledger_id=? AND EXISTS (SELECT 1 FROM transactions WHERE id=? AND ledger_id=? AND updated_at=?)",
          )
          .bind(row.type === "支出" ? row.amount : -row.amount, row.accountId, ledgerId, row.id, ledgerId, row.updatedAt),
        db
          .prepare("DELETE FROM side_hustle_deductions WHERE transaction_id=? AND EXISTS (SELECT 1 FROM transactions WHERE id=? AND ledger_id=? AND updated_at=?)")
          .bind(row.id, row.id, ledgerId, row.updatedAt),
        db.prepare("DELETE FROM transactions WHERE id=? AND ledger_id=? AND updated_at=?").bind(row.id, ledgerId, row.updatedAt),
      );
    }
    for (let index = 0; index < statements.length; index += 160) {
      const results = await db.batch(statements.slice(index, index + 160));
      for (let resultIndex = 2; resultIndex < results.length; resultIndex += 3)
        if (Number(results[resultIndex]?.meta.changes ?? 0) !== 1)
          return privateJson({ error: "待清理流水已被其他请求处理，请刷新后重试" }, { status: 409 });
    }
    return privateJson({ ok: true, deleted: rows.results.length });
  } catch (error) {
    return accessErrorResponse(error, "清理失败", request);
  }
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    const rows = await getDbBinding().prepare("SELECT id,source_label sourceLabel,imported_count importedCount,status,created_at createdAt,completed_at completedAt,undone_at undoneAt,undo_started_at undoStartedAt,(status='undoing' AND undo_started_at IS NOT NULL AND undo_started_at<=datetime('now','-10 minutes')) undoResumable FROM import_batches WHERE owner_id=? AND ledger_id=? ORDER BY created_at DESC,id DESC LIMIT 20").bind(ownerId, ledgerId).all();
    return privateJson({ batches: rows.results });
  } catch (error) {
    return accessErrorResponse(error, "读取导入批次失败", request);
  }
}
