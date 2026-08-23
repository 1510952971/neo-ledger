import { NextResponse } from "next/server";
import { ensureDb, getDbBinding, processDueInstallments } from "../../../db";
import { ApiAccessError, accessErrorResponse, claimAndRequireLedger, guardedApiResponse, requestOwnerId } from "../../api-security";
import { readInstallmentInput } from "../../internal-api-contract";
import { MAX_INSTALLMENT_COUNT } from "../../planning-limits";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

type ExistingInstallment = {
  id: number;
  name: string;
  totalAmount: number;
  periods: number;
  feeAmount: number;
  accountId: number;
  paymentAccountId: number;
  startMonth: string;
  chargeDay: number;
};

type ExistingInstallmentReversal = {
  ledgerId: number;
  toAccountId: number;
  targetId: number;
  amount: number;
};

function expectedVersion(value: string | null) {
  if (!value || value.length > 64) throw new ApiAccessError("分期版本已失效，请刷新后重试", 409);
  return value;
}

function duplicateInstallmentResponse(
  existing: ExistingInstallment,
  input: {
    name: string;
    total: number;
    periods: number;
    fee: number;
    accountId: number;
    paymentAccountId: number;
    startMonth: string;
    day: number;
  },
) {
  if (
    existing.name !== input.name ||
    existing.totalAmount !== input.total ||
    existing.periods !== input.periods ||
    existing.feeAmount !== input.fee ||
    existing.accountId !== input.accountId ||
    existing.paymentAccountId !== input.paymentAccountId ||
    existing.startMonth !== input.startMonth ||
    existing.chargeDay !== input.day
  )
    throw new ApiAccessError("幂等键已经用于其他分期", 409);
  return privateJson({ id: existing.id, duplicate: true });
}

function duplicateInstallmentReversalResponse(
  existing: ExistingInstallmentReversal,
  installmentId: number,
  amount: number,
) {
  if (existing.targetId !== installmentId || existing.amount !== amount)
    throw new ApiAccessError("幂等键已经用于其他分期撤销", 409);
  return privateJson({ ok: true, duplicate: true });
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取分期失败", async () => {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
    await claimAndRequireLedger(request, ledgerId);
    await processDueInstallments(ledgerId);
    const db = getDbBinding();
    const total = await db
      .prepare("SELECT COUNT(*) count FROM installments WHERE ledger_id=?")
      .bind(ledgerId)
      .first<{ count: number }>();
    const rows = await db
      .prepare(
        "SELECT id,ledger_id AS ledgerId,name,total_amount AS totalAmount,periods,paid_periods AS paidPeriods,fee_amount AS feeAmount,account_id AS accountId,payment_account_id AS paymentAccountId,start_month AS startMonth,charge_day AS chargeDay,currency,uuid,updated_at AS updatedAt,created_at AS createdAt FROM installments WHERE ledger_id=? ORDER BY id DESC LIMIT ?",
      )
      .bind(ledgerId, MAX_INSTALLMENT_COUNT)
      .all();
    const response = privateJson(rows.results);
    const totalCount = Number(total?.count ?? 0);
    response.headers.set("X-Total-Count", String(totalCount));
    response.headers.set("X-Has-More", totalCount > MAX_INSTALLMENT_COUNT ? "1" : "0");
    return response;
  });
}
export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await readInstallmentInput(request);
    const { ledgerId, accountId, paymentAccountId, periods, name, idempotencyKey } = body,
      total = Math.round(body.totalAmount * 100),
      fee = Math.round(body.feeAmount * 100),
      day = body.chargeDay;
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const occurrenceKey = idempotencyKey
      ? `manual:${ownerId}:installment:${idempotencyKey}`
      : null;
    const input = {
      name,
      total,
      periods,
      fee,
      accountId,
      paymentAccountId,
      startMonth: body.startMonth,
      day,
    };
    if (occurrenceKey) {
      const existing = await db
        .prepare("SELECT i.id,i.name,i.total_amount totalAmount,i.periods,i.fee_amount feeAmount,i.account_id accountId,i.payment_account_id paymentAccountId,i.start_month startMonth,i.charge_day chargeDay FROM account_transfers t JOIN installments i ON i.id=t.target_id WHERE t.ledger_id=? AND t.occurrence_key=? AND t.kind='负债入账'")
        .bind(ledgerId, occurrenceKey)
        .first<ExistingInstallment>();
      if (existing) return duplicateInstallmentResponse(existing, input);
    }
    const count = await db
      .prepare("SELECT COUNT(*) count FROM installments WHERE ledger_id=?")
      .bind(ledgerId)
      .first<{ count: number }>();
    if (Number(count?.count ?? 0) >= MAX_INSTALLMENT_COUNT)
      throw new ApiAccessError("分期最多 " + MAX_INSTALLMENT_COUNT + " 个", 409);
    const account = await db
        .prepare(
          "SELECT currency,type FROM accounts WHERE id=? AND ledger_id=?",
        )
        .bind(accountId, ledgerId)
        .first<{ currency: string; type: string }>();
    if (!account) throw new Error("绑定账户不存在");
    if (account.type !== "负债") throw new Error("分期必须绑定负债账户");
    const paymentAccount = await db
      .prepare("SELECT id,currency,type FROM accounts WHERE id=? AND ledger_id=?")
      .bind(paymentAccountId, ledgerId)
      .first<{ id: number; currency: string; type: string }>();
    if (!paymentAccount || paymentAccount.type !== "资产")
      throw new Error("请选择用于每月还款的资产账户");
    if (paymentAccount.currency !== account.currency)
      throw new Error("负债账户与还款账户币种必须一致");
    const installmentUuid = crypto.randomUUID();
    let results;
    try {
      results = await db.batch([
        db.prepare(
        "INSERT INTO installments(ledger_id,name,total_amount,periods,fee_amount,account_id,payment_account_id,start_month,charge_day,currency,uuid,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        ).bind(
          ledgerId,
          name,
          total,
          periods,
          fee,
          accountId,
          paymentAccountId,
          body.startMonth,
          day,
          account.currency,
          installmentUuid,
        ),
        db.prepare(
        "INSERT INTO account_transfers(uuid,ledger_id,kind,from_account_id,amount,currency,target_type,target_id,occurrence_key,occurred_at,original_timezone,note) VALUES(lower(hex(randomblob(16))),?,'负债入账',?,?,?,'installment',(SELECT id FROM installments WHERE uuid=?),?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Asia/Shanghai',?)",
        ).bind(ledgerId, accountId, total + fee, account.currency, installmentUuid, occurrenceKey, `建立分期 · ${name}`),
      ]);
    } catch (error) {
      if (occurrenceKey && error instanceof Error && /unique|constraint/iu.test(error.message)) {
        const existing = await db
          .prepare("SELECT i.id,i.name,i.total_amount totalAmount,i.periods,i.fee_amount feeAmount,i.account_id accountId,i.payment_account_id paymentAccountId,i.start_month startMonth,i.charge_day chargeDay FROM account_transfers t JOIN installments i ON i.id=t.target_id WHERE t.ledger_id=? AND t.occurrence_key=? AND t.kind='负债入账'")
          .bind(ledgerId, occurrenceKey)
          .first<ExistingInstallment>();
        if (existing) return duplicateInstallmentResponse(existing, input);
      }
      throw error;
    }
    await processDueInstallments(ledgerId);
    const id = Number(results[0].meta.last_row_id);
    return privateJson(
      { id, duplicate: false },
      { status: 201 },
    );
  } catch (error) {
    return accessErrorResponse(error, "创建失败", request);
  }
}
export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    const expectedUpdatedAt = expectedVersion(url.searchParams.get("expectedUpdatedAt"));
    const idempotencyKey = url.searchParams.get("idempotencyKey") || undefined;
    const db = getDbBinding();
    const ownerId = await requestOwnerId(request);
    const occurrenceKey = idempotencyKey
      ? `manual:${ownerId}:installment-reversal:${id}:${idempotencyKey}`
      : null;
    if (occurrenceKey) {
      const existing = await db
        .prepare("SELECT t.ledger_id ledgerId,t.to_account_id toAccountId,t.target_id targetId,t.amount FROM account_transfers t JOIN ledgers l ON l.id=t.ledger_id WHERE l.owner_id=? AND t.occurrence_key=? AND t.kind='分期撤销'")
        .bind(ownerId, occurrenceKey)
        .first<ExistingInstallmentReversal>();
      if (existing) {
        await claimAndRequireLedger(request, existing.ledgerId);
        return duplicateInstallmentReversalResponse(existing, id, existing.amount);
      }
    }
    const used = await db
      .prepare(
        "SELECT i.paid_periods paid,i.total_amount total,i.fee_amount fee,i.account_id accountId,i.ledger_id ledgerId,i.uuid,i.updated_at updatedAt,a.type accountType FROM installments i JOIN accounts a ON a.id=i.account_id WHERE i.id=?",
      )
      .bind(id)
      .first<{
        paid: number;
        total: number;
        fee: number;
        accountId: number;
        accountType: string;
        ledgerId: number;
        uuid: string;
        updatedAt: string;
      }>();
    if (!used) return privateJson({ error: "项目不存在" }, { status: 404 });
    await claimAndRequireLedger(request, used.ledgerId);
    if (used.updatedAt !== expectedUpdatedAt)
      return privateJson({ error: "这笔分期已在其他位置更新，请刷新后重试" }, { status: 409 });
    if (used.paid > 0)
      return privateJson(
        { error: "已有还款流水，不能直接删除" },
        { status: 409 },
      );
    const nextUpdatedAt = new Date().toISOString();
    const statements = [
      db.prepare("UPDATE installments SET updated_at=? WHERE id=? AND ledger_id=? AND updated_at=? AND paid_periods=0").bind(nextUpdatedAt, id, used.ledgerId, expectedUpdatedAt),
    ];
    if (used.accountType === "负债") statements.push(
      db.prepare("INSERT INTO account_transfers(uuid,ledger_id,kind,to_account_id,amount,currency,target_type,target_id,occurrence_key,occurred_at,original_timezone,note) SELECT lower(hex(randomblob(16))),ledger_id,'分期撤销',account_id,total_amount+fee_amount,currency,'installment',id,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Asia/Shanghai','撤销未还款分期' FROM installments WHERE id=? AND ledger_id=? AND updated_at=? AND changes()>0").bind(occurrenceKey, id, used.ledgerId, nextUpdatedAt),
    );
    statements.push(
      db.prepare("INSERT OR REPLACE INTO sync_tombstones(entity_type,entity_uuid,ledger_id,deleted_at) SELECT 'installment',uuid,ledger_id,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM installments WHERE id=? AND ledger_id=? AND updated_at=? AND changes()>0").bind(id, used.ledgerId, nextUpdatedAt),
      db.prepare("DELETE FROM installments WHERE id=? AND ledger_id=? AND updated_at=? AND changes()>0").bind(id, used.ledgerId, nextUpdatedAt),
    );
    try {
      const results = await db.batch(statements);
      if (Number(results.at(-1)?.meta.changes ?? 0) !== 1)
        return privateJson({ error: "这笔分期已在其他位置更新，请刷新后重试" }, { status: 409 });
    } catch (error) {
      if (occurrenceKey && error instanceof Error && /unique|constraint/iu.test(error.message)) {
        const existing = await db
          .prepare("SELECT ledger_id ledgerId,to_account_id toAccountId,target_id targetId,amount FROM account_transfers WHERE ledger_id=? AND occurrence_key=? AND kind='分期撤销'")
          .bind(used.ledgerId, occurrenceKey)
          .first<ExistingInstallmentReversal>();
        if (existing)
          return duplicateInstallmentReversalResponse(existing, id, used.total + used.fee);
      }
      throw error;
    }
    return privateJson({ ok: true, duplicate: false });
  } catch (error) {
    return accessErrorResponse(error, "删除失败", request);
  }
}
