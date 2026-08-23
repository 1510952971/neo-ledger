import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { claimAndRequireLedger, guardedApiResponse } from "../../../api-security";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/u;

type Cursor = { occurredAt: string; id: number };
type TransactionRow = {
  id: number;
  ledgerId: number;
  title: string;
  amount: number;
  type: "支出" | "收入";
  mood: string | null;
  category: string | null;
  categoryDynamic: string | null;
  incomeCategory: string | null;
  incomeCategoryDynamic: string | null;
  accountId: number;
  paidByMemberId: number | null;
  splitWithMemberId: number | null;
  splitMode: string | null;
  mySharePercent: number;
  currency: string;
  originalAmount: number | null;
  originalCurrency: string | null;
  exchangeRateMicros: number;
  originalTimezone: string;
  installmentId: number | null;
  installmentNumber: number | null;
  isSideHustle: number;
  offlineId: string | null;
  crdtId: string | null;
  updatedAt: string;
  occurredAt: string;
  createdAt: string;
  accountName: string;
};

function decodeCursor(value: string | null): Cursor | null {
  if (!value || value.length > 256) return null;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===";
    const binary = atob(padded.slice(0, padded.length - (padded.length % 4)));
    const parsed: unknown = JSON.parse(binary);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const cursor = parsed as Record<string, unknown>;
    return typeof cursor.occurredAt === "string" && cursor.occurredAt.length > 0 &&
      Number.isSafeInteger(cursor.id) && Number(cursor.id) > 0
      ? { occurredAt: cursor.occurredAt, id: Number(cursor.id) }
      : null;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: Cursor) {
  const binary = JSON.stringify(cursor);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

function readDateParam(value: string | null, name: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (!DATE_KEY.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${name} 格式无效`);
  return value;
}

function nextDateKey(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取流水失败", async () => {
    await ensureDb();
    const url = new URL(request.url);
    const ledgerId = Number(url.searchParams.get("ledger"));
    await claimAndRequireLedger(request, ledgerId);
    const rawLimit = Number(url.searchParams.get("limit") || DEFAULT_PAGE_SIZE);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_PAGE_SIZE)
      throw new Error(`limit 必须介于 1 和 ${MAX_PAGE_SIZE} 之间`);
    const cursorValue = url.searchParams.get("cursor");
    const cursor = decodeCursor(cursorValue);
    if (cursorValue && !cursor) throw new Error("cursor 无效");
    const rawQuery = url.searchParams.get("q") || "";
    if (rawQuery.length > 80) throw new Error("q 不能超过 80 个字符");
    const query = rawQuery.trim();
    const rawId = url.searchParams.get("id");
    const parsedId = rawId === null ? null : Number(rawId);
    if (rawId !== null && (parsedId === null || !Number.isSafeInteger(parsedId) || parsedId <= 0)) throw new Error("id 无效");
    const transactionId: number | null = parsedId;
    const from = readDateParam(url.searchParams.get("from"), "from");
    const to = readDateParam(url.searchParams.get("to"), "to");
    if (from && to && from > to) throw new Error("日期范围无效");
    const rawOffset = Number(url.searchParams.get("offset") || 0);
    if (!Number.isInteger(rawOffset) || rawOffset < -840 || rawOffset > 840) throw new Error("offset 无效");
    const offsetModifier = `${rawOffset >= 0 ? "+" : ""}${rawOffset} minutes`;
    const localDateExpr = `datetime(t.occurred_at,'${offsetModifier}')`;
    const filters = ["t.ledger_id=?"];
    const params: Array<string | number> = [ledgerId];
    if (transactionId !== null) {
      filters.push("t.id=?");
      params.push(transactionId);
    }
    if (from) {
      filters.push(`${localDateExpr}>=?`);
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      filters.push(`${localDateExpr}<?`);
      params.push(`${nextDateKey(to)} 00:00:00`);
    }
    if (query) {
      const like = `%${escapeLike(query.toLocaleLowerCase("zh-CN"))}%`;
      filters.push(`(LOWER(t.title) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(t.category_dynamic,t.category,'')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(t.income_category_dynamic,t.income_category,'')) LIKE ? ESCAPE '\\' OR LOWER(t.type) LIKE ? ESCAPE '\\' OR LOWER(t.currency) LIKE ? ESCAPE '\\' OR LOWER(a.name) LIKE ? ESCAPE '\\' OR CAST(t.amount/100.0 AS TEXT) LIKE ? ESCAPE '\\' OR date(${localDateExpr}) LIKE ? ESCAPE '\\')`);
      params.push(like, like, like, like, like, like, like, like);
    }
    const pageFilters = cursor
      ? [...filters, "(t.occurred_at<? OR (t.occurred_at=? AND t.id<?))"]
      : filters;
    const pageParams = cursor
      ? [...params, cursor.occurredAt, cursor.occurredAt, cursor.id]
      : params;
    const predicate = pageFilters.join(" AND ");
    const countPredicate = filters.join(" AND ");
    const db = getDbBinding();
    const rows = await db
      .prepare(
        `SELECT t.id,t.ledger_id ledgerId,t.title,t.amount,t.type,t.mood,t.category,
          t.category_dynamic categoryDynamic,t.income_category incomeCategory,
          t.income_category_dynamic incomeCategoryDynamic,t.account_id accountId,
          t.paid_by_member_id paidByMemberId,t.split_with_member_id splitWithMemberId,
          t.split_mode splitMode,t.my_share_percent mySharePercent,t.currency,
          t.original_amount originalAmount,t.original_currency originalCurrency,
          t.exchange_rate_micros exchangeRateMicros,t.original_timezone originalTimezone,
          t.installment_id installmentId,t.installment_number installmentNumber,
          t.is_side_hustle isSideHustle,t.offline_id offlineId,t.crdt_id crdtId,
          t.updated_at updatedAt,t.occurred_at occurredAt,t.created_at createdAt,
          a.name accountName
        FROM transactions t JOIN accounts a ON a.id=t.account_id
        WHERE ${predicate}
        ORDER BY t.occurred_at DESC,t.id DESC LIMIT ?`,
      )
      .bind(...pageParams, rawLimit)
      .all<TransactionRow>();
    const total = await db
      .prepare(`SELECT COUNT(*) count FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE ${countPredicate}`)
      .bind(...params)
      .first<{ count: number }>();
    const aggregate = await db
      .prepare(`SELECT
        COALESCE(SUM(CASE WHEN t.type='收入' THEN t.amount*(CASE t.currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN 0.0462 WHEN 'EUR' THEN 7.85 ELSE 1 END) ELSE 0 END),0) income,
        COALESCE(SUM(CASE WHEN t.type='支出' THEN t.amount*(CASE t.currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN 0.0462 WHEN 'EUR' THEN 7.85 ELSE 1 END) ELSE 0 END),0) expense
        FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE ${countPredicate}`)
      .bind(...params)
      .first<{ income: number; expense: number }>();
    const items = rows.results.map((row) => ({
      ...row,
      category: row.categoryDynamic ?? row.category,
      incomeCategory: row.incomeCategoryDynamic ?? row.incomeCategory,
      isSideHustle: Boolean(row.isSideHustle),
    }));
    const last = rows.results.at(-1);
    return privateJson({
      items,
      total: Number(total?.count ?? 0),
      income: Number(aggregate?.income ?? 0),
      expense: Number(aggregate?.expense ?? 0),
      balance: Number(aggregate?.income ?? 0) - Number(aggregate?.expense ?? 0),
      limit: rawLimit,
      nextCursor: rows.results.length === rawLimit && last
        ? encodeCursor({ occurredAt: last.occurredAt, id: last.id })
        : null,
    });
  });
}
