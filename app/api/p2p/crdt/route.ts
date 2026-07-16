import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../../api-security";
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
export async function GET(request: Request) {
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
  return NextResponse.json({
    transactions: rows.results,
    tombstones: tombs.results,
    cursor: new Date().toISOString().replace("T", " ").slice(0, 19),
  });
}
export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
        ledgerId?: number;
        transactions?: Incoming[];
        tombstones?: { crdtId: string; deletedAt: string }[];
      },
      ledgerId = Number(body.ledgerId || 1),
      db = getDbBinding();
    await claimAndRequireLedger(request, ledgerId);
    let inserted = 0,
      deleted = 0;
    for (const row of (body.transactions || []).slice(0, 1000)) {
      if (!row.crdtId || !row.amount) continue;
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
            "SELECT name,builtin_key builtinKey FROM expense_categories WHERE ledger_id=? AND name=?",
          )
          .bind(ledgerId, row.category)
          .first<{ name: string; builtinKey: string | null }>();
        if (!configuredCategory) {
          await db
            .prepare(
              "INSERT INTO expense_categories(ledger_id,name,icon,color,sort_order) VALUES(?,?,'📦','#8f91b8',(SELECT COALESCE(MAX(sort_order),0)+10 FROM expense_categories WHERE ledger_id=?))",
            )
            .bind(ledgerId, row.category, ledgerId)
            .run();
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
            "SELECT name,builtin_key builtinKey FROM income_categories WHERE ledger_id=? AND name=?",
          )
          .bind(ledgerId, row.incomeCategory)
          .first<{ name: string; builtinKey: string | null }>();
        if (!configuredIncomeCategory) {
          await db
            .prepare(
              "INSERT INTO income_categories(ledger_id,name,icon,color,sort_order) VALUES(?,?,'💰','#78a98c',(SELECT COALESCE(MAX(sort_order),0)+10 FROM income_categories WHERE ledger_id=?))",
            )
            .bind(ledgerId, row.incomeCategory, ledgerId)
            .run();
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
    for (const tomb of (body.tombstones || []).slice(0, 1000)) {
      if (!tomb.crdtId) continue;
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
    return NextResponse.json({ ok: true, inserted, deleted });
  } catch (error) {
    return accessErrorResponse(error, "CRDT 合并失败");
  }
}
