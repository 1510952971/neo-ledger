import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { accessErrorResponse, claimAndRequireLedger, guardedApiResponse } from "../../../api-security";
import { requireSameOrigin } from "../../../auth";
import { MAX_CATEGORY_COUNT } from "../../../category-limits";
import { MAX_PROTOCOL_BODY_BYTES, readJsonWithLimit } from "../../../request-limits";

function privateJson(body: unknown) {
  const headers = new Headers({
    "Cache-Control": "no-store, private, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  return NextResponse.json(body, { headers });
}

type Incoming = {
  crdtId: string;
  title: string;
  amount: number;
  type: string;
  mood?: string | null;
  category?: string | null;
  incomeCategory?: string | null;
  currency: string;
  occurredAt: string;
  updatedAt: string;
  accountName: string;
};

const currencies = new Set(["CNY", "USD", "JPY", "EUR"]);
const moods = new Set(["悦己", "刚需", "冲动"]);

function normalizeIncoming(value: unknown): Incoming | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const crdtId = String(row.crdtId ?? "").trim();
  const title = String(row.title ?? "").trim();
  const amount = Number(row.amount);
  const type = row.type === "支出" || row.type === "收入" ? row.type : null;
  const currency = String(row.currency ?? "").trim();
  const occurredAt = String(row.occurredAt ?? "").trim();
  const updatedAt = String(row.updatedAt ?? "").trim();
  const accountName = String(row.accountName ?? "").trim();
  const mood = row.mood == null ? null : String(row.mood).trim();
  const category = row.category == null ? null : String(row.category).trim();
  const incomeCategory = row.incomeCategory == null ? null : String(row.incomeCategory).trim();
  if (
    !crdtId || crdtId.length > 128 ||
    !title || title.length > 120 ||
    !Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000_000 ||
    !type || !currencies.has(currency) ||
    !occurredAt || occurredAt.length > 64 || !updatedAt || updatedAt.length > 64 ||
    !accountName || accountName.length > 60 ||
    (mood !== null && !moods.has(mood)) ||
    (category !== null && (!category || category.length > 40)) ||
    (incomeCategory !== null && (!incomeCategory || incomeCategory.length > 40))
  ) return null;
  return { crdtId, title, amount, type, mood, category, incomeCategory, currency, occurredAt, updatedAt, accountName };
}

function normalizeTombstone(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const crdtId = String(row.crdtId ?? "").trim();
  const deletedAt = String(row.deletedAt ?? "").trim();
  if (!crdtId || crdtId.length > 128 || !deletedAt || deletedAt.length > 64) return null;
  return { crdtId, deletedAt };
}
export async function GET(request: Request) {
  return guardedApiResponse(request, "读取附近同步数据失败", async () => {
    await ensureDb();
    const url = new URL(request.url),
      ledgerId = Number(url.searchParams.get("ledger") || 1),
      since = String(url.searchParams.get("since") || "1970-01-01 00:00:00"),
      db = getDbBinding();
    await claimAndRequireLedger(request, ledgerId);
    const [rows, tombs] = await Promise.all([
      db
        .prepare(
          "SELECT t.crdt_id crdtId,t.title,t.amount,t.type,t.mood,COALESCE(t.category_dynamic,t.category) category,COALESCE(t.income_category_dynamic,t.income_category) incomeCategory,t.currency,t.occurred_at occurredAt,t.updated_at updatedAt,a.name accountName FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE t.ledger_id=? AND t.updated_at>? ORDER BY t.updated_at LIMIT 1000",
        )
        .bind(ledgerId, since)
        .all(),
      db
        .prepare(
          "SELECT crdt_id crdtId,deleted_at deletedAt FROM crdt_tombstones WHERE ledger_id=? AND deleted_at>? ORDER BY deleted_at LIMIT 1000",
        )
        .bind(ledgerId, since)
        .all(),
    ]);
    return privateJson({
      transactions: rows.results,
      tombstones: tombs.results,
      cursor: new Date().toISOString().replace("T", " ").slice(0, 19),
    });
  });
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureDb();
    const body = await readJsonWithLimit<{
        ledgerId?: number;
        transactions?: unknown;
        tombstones?: unknown;
      }>(request, MAX_PROTOCOL_BODY_BYTES),
      ledgerId = Number(body.ledgerId || 1),
      db = getDbBinding();
    await claimAndRequireLedger(request, ledgerId);
    let inserted = 0,
      deleted = 0;
    for (const rawRow of (Array.isArray(body.transactions) ? body.transactions : []).slice(0, 1000)) {
      const row = normalizeIncoming(rawRow);
      if (!row) continue;
      const tomb = await db
        .prepare("SELECT 1 ok FROM crdt_tombstones WHERE crdt_id=? AND ledger_id=?")
        .bind(row.crdtId, ledgerId)
        .first();
      if (tomb) continue;
      const exists = await db
        .prepare("SELECT 1 ok FROM transactions WHERE crdt_id=?")
        .bind(row.crdtId)
        .first();
      if (exists) continue;
      const account =
        (await db
          .prepare(
            "SELECT id,currency FROM accounts WHERE ledger_id=? AND name=?",
          )
          .bind(ledgerId, row.accountName)
          .first<{ id: number; currency: string }>()) ??
        (await db
          .prepare(
            "SELECT id,currency FROM accounts WHERE ledger_id=? ORDER BY id LIMIT 1",
          )
          .bind(ledgerId)
          .first<{ id: number; currency: string }>());
      if (!account) continue;
      if (row.currency && row.currency !== account.currency) continue;
      let configuredCategory: { name: string; builtinKey: string | null } | null = null;
      if (row.type === "支出" && row.category) {
        configuredCategory = await db
          .prepare(
            "SELECT name,builtin_key builtinKey FROM expense_categories WHERE ledger_id=? AND name=? AND is_active=1",
          )
          .bind(ledgerId, row.category)
          .first<{ name: string; builtinKey: string | null }>();
        if (!configuredCategory) {
          const created = await db
            .prepare(
              "INSERT INTO expense_categories(ledger_id,name,icon,color,sort_order) SELECT ?,?,'📦','#8f91b8',(SELECT COALESCE(MAX(sort_order),0)+10 FROM expense_categories WHERE ledger_id=?) WHERE (SELECT COUNT(*) FROM expense_categories WHERE ledger_id=?) < ?",
            )
            .bind(ledgerId, row.category, ledgerId, ledgerId, MAX_CATEGORY_COUNT)
            .run();
          if (!created.meta.changes) continue;
          configuredCategory = { name: row.category, builtinKey: null };
        }
      }
      let configuredIncomeCategory: {
        name: string;
        builtinKey: string | null;
      } | null = null;
      if (row.type === "收入" && row.incomeCategory) {
        configuredIncomeCategory = await db
          .prepare(
            "SELECT name,builtin_key builtinKey FROM income_categories WHERE ledger_id=? AND name=? AND is_active=1",
          )
          .bind(ledgerId, row.incomeCategory)
          .first<{ name: string; builtinKey: string | null }>();
        if (!configuredIncomeCategory) {
          const created = await db
            .prepare(
              "INSERT INTO income_categories(ledger_id,name,icon,color,sort_order) SELECT ?,?,'💰','#78a98c',(SELECT COALESCE(MAX(sort_order),0)+10 FROM income_categories WHERE ledger_id=?) WHERE (SELECT COUNT(*) FROM income_categories WHERE ledger_id=?) < ?",
            )
            .bind(ledgerId, row.incomeCategory, ledgerId, ledgerId, MAX_CATEGORY_COUNT)
            .run();
          if (!created.meta.changes) continue;
          configuredIncomeCategory = {
            name: row.incomeCategory,
            builtinKey: null,
          };
        }
      }
      await db.batch([
        db
          .prepare(
            "INSERT INTO transactions(ledger_id,title,amount,type,mood,category,category_dynamic,income_category,income_category_dynamic,account_id,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,occurred_at,crdt_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1000000,'legacy/unknown',?,?,?)",
          )
          .bind(
            ledgerId,
            row.title,
            Math.round(row.amount),
            row.type,
            row.mood ?? null,
            configuredCategory?.builtinKey ?? null,
            configuredCategory?.name ?? null,
            configuredIncomeCategory?.builtinKey ?? null,
            configuredIncomeCategory?.name ?? null,
            account.id,
            account.currency,
            Math.round(row.amount),
            account.currency,
            row.occurredAt,
            row.crdtId,
            row.updatedAt,
          ),
        db
          .prepare(
            "UPDATE accounts SET current_balance=current_balance+? WHERE id=?",
          )
          .bind(
            row.type === "支出"
              ? -Math.round(row.amount)
              : Math.round(row.amount),
            account.id,
          ),
      ]);
      inserted++;
    }
    for (const rawTomb of (Array.isArray(body.tombstones) ? body.tombstones : []).slice(0, 1000)) {
      const tomb = normalizeTombstone(rawTomb);
      if (!tomb) continue;
      const row = await db
        .prepare(
          "SELECT id,amount,type,account_id accountId,ledger_id ledgerId FROM transactions WHERE crdt_id=? AND ledger_id=?",
        )
        .bind(tomb.crdtId, ledgerId)
        .first<{
          id: number;
          amount: number;
          type: string;
          accountId: number;
          ledgerId: number;
        }>();
      await db
        .prepare(
          "INSERT OR IGNORE INTO crdt_tombstones(crdt_id,ledger_id,deleted_at) VALUES(?,?,?)",
        )
        .bind(tomb.crdtId, ledgerId, tomb.deletedAt || new Date().toISOString())
        .run();
      if (row) {
        await db.batch([
          db
            .prepare(
              "UPDATE accounts SET current_balance=current_balance+? WHERE id=?",
            )
            .bind(
              row.type === "支出" ? row.amount : -row.amount,
              row.accountId,
            ),
          db
            .prepare(
              "DELETE FROM side_hustle_deductions WHERE transaction_id=?",
            )
            .bind(row.id),
          db.prepare("DELETE FROM transactions WHERE id=?").bind(row.id),
        ]);
        deleted++;
      }
    }
    return privateJson({ ok: true, inserted, deleted });
  } catch (error) {
    return accessErrorResponse(error, "CRDT 合并失败", request);
  }
}
