import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../../api-security";
import { transactionAccountDelta } from "../../../split-core.js";
import { MAX_PROTOCOL_BODY_BYTES, readJsonWithLimit } from "../../../request-limits";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

type SnapshotRow = {
  token: string;
  ledgerId: number;
  transactionId: number;
  deletedAt: string;
  payload: string;
};

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await readJsonWithLimit<Record<string, unknown>>(
      request,
      MAX_PROTOCOL_BODY_BYTES,
    );
    const token = String(body.undoToken ?? '').trim();
    const ledgerId = Number(body.ledgerId);
    if (!token || token.length > 80) throw new Error('撤销令牌无效');
    if (!Number.isInteger(ledgerId) || ledgerId <= 0) throw new Error('账本不存在');
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const snapshot = await db
      .prepare(
        "SELECT token,ledger_id ledgerId,transaction_id transactionId,deleted_at deletedAt,payload FROM transaction_delete_snapshots WHERE token=? AND ledger_id=?",
      )
      .bind(token, ledgerId)
      .first<SnapshotRow>();
    if (!snapshot) throw new Error('撤销窗口已过期或流水已恢复');
    if (Date.now() - Date.parse(snapshot.deletedAt) > 120_000)
      throw new Error('撤销窗口已过期');
    const parsed = JSON.parse(snapshot.payload) as {
      transaction?: Record<string, unknown>;
      sideHustle?: { amount?: number; note?: string } | null;
    };
    const transaction = parsed.transaction;
    if (!transaction) throw new Error('撤销快照损坏');
    const existing = await db
      .prepare("SELECT id FROM transactions WHERE id=? AND ledger_id=?")
      .bind(snapshot.transactionId, ledgerId)
      .first();
    if (existing) throw new Error('该流水已经被其他操作恢复');
    const accountId = Number(transaction.account_id);
    const amount = Number(transaction.amount);
    const type = String(transaction.type);
    const splitMode = transaction.split_mode == null ? null : String(transaction.split_mode);
    const splitWithMemberId = Number(transaction.split_with_member_id ?? 0) || 0;
    if (!Number.isInteger(accountId) || !Number.isInteger(amount) || amount <= 0)
      throw new Error('撤销快照中的账户或金额无效');
    const account = await db
      .prepare("SELECT id,is_investment isInvestment FROM accounts WHERE id=? AND ledger_id=?")
      .bind(accountId, ledgerId)
      .first<{ id: number; isInvestment: number }>();
    if (!account) throw new Error('原账户已不存在，无法安全撤销');
    const crdtId = String(transaction.crdt_id ?? `legacy:${snapshot.transactionId}`);
    const updatedAt = new Date().toISOString();
    const values = [
      snapshot.transactionId,
      ledgerId,
      String(transaction.title ?? '恢复的流水'),
      String(transaction.note ?? ''),
      String(transaction.tags_json ?? '[]'),
      amount,
      type,
      transaction.mood ?? null,
      transaction.category ?? null,
      transaction.category_dynamic ?? transaction.category ?? null,
      transaction.income_category ?? null,
      transaction.income_category_dynamic ?? transaction.income_category ?? null,
      accountId,
      transaction.paid_by_member_id ?? null,
      transaction.split_with_member_id ?? null,
      splitMode,
      Number(transaction.my_share_percent ?? 100),
      String(transaction.currency ?? 'CNY'),
      transaction.original_amount ?? null,
      transaction.original_currency ?? null,
      Number(transaction.exchange_rate_micros ?? 1_000_000),
      String(transaction.original_timezone ?? 'Asia/Shanghai'),
      transaction.occurrence_key ?? null,
      transaction.installment_id ?? null,
      transaction.installment_number ?? null,
      transaction.is_side_hustle ? 1 : 0,
      transaction.reimbursable ? 1 : 0,
      Number(transaction.discount_amount ?? 0),
      transaction.exclude_from_budget ? 1 : 0,
      transaction.offline_id ?? null,
      crdtId,
      updatedAt,
      String(transaction.occurred_at ?? updatedAt),
      String(transaction.created_at ?? updatedAt),
    ];
    const incomeInvestment =
      type === '收入' && transaction.income_category === '理财收益' && account.isInvestment;
    const results = await db.batch([
      db
        .prepare(
          "INSERT INTO transactions(id,ledger_id,title,note,tags_json,amount,type,mood,category,category_dynamic,income_category,income_category_dynamic,account_id,paid_by_member_id,split_with_member_id,split_mode,my_share_percent,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,occurrence_key,installment_id,installment_number,is_side_hustle,reimbursable,discount_amount,exclude_from_budget,offline_id,crdt_id,updated_at,occurred_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(...values),
      db
        .prepare(
          "UPDATE accounts SET current_balance=current_balance+?,cumulative_income=cumulative_income+?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND ledger_id=?",
        )
        .bind(
          transactionAccountDelta(type, amount, splitMode, splitWithMemberId),
          incomeInvestment ? amount : 0,
          accountId,
          ledgerId,
        ),
      parsed.sideHustle
        ? db
            .prepare(
              "INSERT OR REPLACE INTO side_hustle_deductions(ledger_id,transaction_id,amount,note) VALUES(?,?,?,?)",
            )
            .bind(
              ledgerId,
              snapshot.transactionId,
              Number(parsed.sideHustle.amount ?? amount),
              String(parsed.sideHustle.note ?? '副业经营成本'),
            )
        : db.prepare("SELECT 1"),
      db
        .prepare("DELETE FROM crdt_tombstones WHERE crdt_id=? AND ledger_id=?")
        .bind(crdtId, ledgerId),
      db
        .prepare("DELETE FROM sync_tombstones WHERE entity_type='transaction' AND entity_uuid=? AND ledger_id=?")
        .bind(crdtId, ledgerId),
      db
        .prepare("DELETE FROM transaction_delete_snapshots WHERE token=?")
        .bind(token),
    ]);
    if (Number(results[0]?.meta.changes ?? 0) !== 1)
      throw new Error('撤销流水失败');
    return privateJson({ ok: true, transactionId: snapshot.transactionId });
  } catch (error) {
    return accessErrorResponse(error, '撤销删除失败', request);
  }
}
