import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { createAccountTransfer } from "../../../db/transfers";
import { ApiAccessError, accessErrorResponse, claimAndRequireLedger } from "../../api-security";
import {
  readTransferDeleteInput,
  readTransferInput,
  readTransferUpdateInput,
} from "../../internal-api-contract";
import { localDateTimeToUtc } from "../../time-money.js";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

type ExistingTransfer = {
  uuid: string;
  kind: string;
  fromAccountId: number | null;
  toAccountId: number | null;
  amount: number;
  note: string;
};

function duplicateTransferResponse(existing: ExistingTransfer, body: {
  kind: string;
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  note?: string;
}) {
  const sameRequest = existing.kind === body.kind &&
    existing.fromAccountId === body.fromAccountId &&
    existing.toAccountId === body.toAccountId &&
    existing.amount === Math.round(body.amount * 100) &&
    existing.note === String(body.note || "").slice(0, 120);
  if (!sameRequest)
    throw new ApiAccessError("幂等键已经用于其他转账", 409);
  return privateJson({ ok: true, uuid: existing.uuid, duplicate: true });
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
    const accountParam = new URL(request.url).searchParams.get("account");
    const accountId = accountParam == null ? null : Number(accountParam);
    if (accountId != null && (!Number.isSafeInteger(accountId) || accountId <= 0))
      throw new ApiAccessError("账户参数无效", 400);
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    if (accountId != null) {
      const account = await db.prepare("SELECT id FROM accounts WHERE id=? AND ledger_id=?")
        .bind(accountId, ledgerId).first<{ id: number }>();
      if (!account) throw new ApiAccessError("账户不存在", 404);
    }
    const query = accountId == null
      ? db.prepare("SELECT t.uuid,t.ledger_id AS ledgerId,t.kind,t.from_account_id AS fromAccountId,src.name AS fromAccountName,t.to_account_id AS toAccountId,dst.name AS toAccountName,t.amount,t.currency,t.target_type AS targetType,t.target_id AS targetId,t.occurrence_key AS occurrenceKey,t.occurred_at AS occurredAt,t.original_timezone AS originalTimezone,t.note,t.updated_at AS updatedAt FROM account_transfers t LEFT JOIN accounts src ON src.id=t.from_account_id LEFT JOIN accounts dst ON dst.id=t.to_account_id WHERE t.ledger_id=? ORDER BY t.occurred_at DESC LIMIT 500")
        .bind(ledgerId)
      : db.prepare("SELECT t.uuid,t.ledger_id AS ledgerId,t.kind,t.from_account_id AS fromAccountId,src.name AS fromAccountName,t.to_account_id AS toAccountId,dst.name AS toAccountName,t.amount,t.currency,t.target_type AS targetType,t.target_id AS targetId,t.occurrence_key AS occurrenceKey,t.occurred_at AS occurredAt,t.original_timezone AS originalTimezone,t.note,t.updated_at AS updatedAt FROM account_transfers t LEFT JOIN accounts src ON src.id=t.from_account_id LEFT JOIN accounts dst ON dst.id=t.to_account_id WHERE t.ledger_id=? AND (t.from_account_id=? OR t.to_account_id=?) ORDER BY t.occurred_at DESC LIMIT 500")
        .bind(ledgerId, accountId, accountId);
    const rows = await query.all();
    return privateJson(rows.results);
  } catch (error) {
    return accessErrorResponse(error, "读取转账记录失败", request);
  }
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await readTransferInput(request);
    const { ledgerId, fromAccountId, toAccountId, kind } = body;
    const amount = Math.round(body.amount * 100);
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const occurrenceKey = body.idempotencyKey
      ? `manual:${ownerId}:transfer:${body.idempotencyKey}`
      : null;
    if (occurrenceKey) {
      const existing = await db
        .prepare("SELECT uuid,kind,from_account_id fromAccountId,to_account_id toAccountId,amount,note FROM account_transfers WHERE ledger_id=? AND occurrence_key=?")
        .bind(ledgerId, occurrenceKey)
        .first<ExistingTransfer>();
      if (existing)
        return duplicateTransferResponse(existing, body);
    }
    const accounts: {
      results: Array<{ id: number; type: string; currency: string; isActive: number }>;
    } = await db
      .prepare("SELECT id,type,currency,is_active isActive FROM accounts WHERE ledger_id=? AND id IN (?,?)")
      .bind(ledgerId, fromAccountId, toAccountId)
      .all<{ id: number; type: string; currency: string; isActive: number }>();
    const from = accounts.results.find((row) => row.id === fromAccountId);
    const to = accounts.results.find((row) => row.id === toAccountId);
    if (!from || !to) throw new Error("转账账户不存在");
    if (!from.isActive || !to.isActive)
      throw new ApiAccessError("停用账户不能用于新转账", 409);
    if (from.currency !== to.currency) throw new Error("跨币种账户请先换汇，不能直接转账");
    if (from.type !== "资产")
      throw new ApiAccessError("转出账户必须是资产账户", 400);
    if (kind === "账户转账" && to.type !== "资产")
      throw new ApiAccessError("账户转账的转入账户必须是资产账户", 400);
    if (kind === "信用卡还款" && to.type !== "负债")
      throw new Error("信用卡还款应从资产账户转入负债账户");
    let uuid: string;
    try {
      uuid = await createAccountTransfer({
        ledgerId,
        kind,
        fromAccountId,
        toAccountId,
        amount,
        currency: from.currency,
        occurrenceKey,
        occurredAt: body.occurredAt,
        originalTimezone: body.originalTimezone,
        note: body.note,
      });
    } catch (error) {
      // Two retries can pass the preflight lookup concurrently. If the
      // database unique index won the race, return the committed transfer
      // instead of turning a successful retry into a 500 response.
      if (occurrenceKey && error instanceof Error && /unique|constraint/iu.test(error.message)) {
        const existing = await db
          .prepare("SELECT uuid,kind,from_account_id fromAccountId,to_account_id toAccountId,amount,note FROM account_transfers WHERE ledger_id=? AND occurrence_key=?")
          .bind(ledgerId, occurrenceKey)
          .first<ExistingTransfer>();
        if (existing)
          return duplicateTransferResponse(existing, body);
      }
      throw error;
    }
    return privateJson({ ok: true, uuid, duplicate: false }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error, "转账失败", request);
  }
}

type EditableTransfer = {
  uuid: string;
  ledgerId: number;
  kind: string;
  fromAccountId: number | null;
  toAccountId: number | null;
  amount: number;
  currency: string;
  targetType: string | null;
  occurredAt: string;
  originalTimezone: string;
  note: string;
  updatedAt: string;
};

type EditableManualTransfer = Omit<EditableTransfer, "fromAccountId" | "toAccountId"> & {
  fromAccountId: number;
  toAccountId: number;
};

async function loadEditableTransfer(
  ledgerId: number,
  uuid: string,
): Promise<EditableManualTransfer> {
  const current = await getDbBinding()
    .prepare("SELECT uuid,ledger_id ledgerId,kind,from_account_id fromAccountId,to_account_id toAccountId,amount,currency,target_type targetType,occurred_at occurredAt,original_timezone originalTimezone,note,updated_at updatedAt FROM account_transfers WHERE uuid=? AND ledger_id=?")
    .bind(uuid, ledgerId)
    .first<EditableTransfer>();
  if (!current) throw new ApiAccessError("转账记录不存在", 404);
  if (
    !["账户转账", "信用卡还款"].includes(current.kind) ||
    current.targetType != null ||
    current.fromAccountId == null ||
    current.toAccountId == null
  ) {
    throw new ApiAccessError("系统生成的转账请在对应的分期、储蓄或资产项目中修改", 409);
  }
  return { ...current, fromAccountId: current.fromAccountId, toAccountId: current.toAccountId };
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = await readTransferUpdateInput(request);
    await claimAndRequireLedger(request, body.ledgerId);
    const db = getDbBinding();
    const current = await loadEditableTransfer(body.ledgerId, body.uuid);
    if (current.updatedAt !== body.expectedUpdatedAt)
      throw new ApiAccessError("这笔转账已在其他位置更新，请刷新后重试", 409);

    const accountRows = await db
      .prepare("SELECT id,type,currency,is_active isActive,current_balance currentBalance FROM accounts WHERE ledger_id=? AND id IN (?,?,?,?)")
      .bind(body.ledgerId, current.fromAccountId, current.toAccountId, body.fromAccountId, body.toAccountId)
      .all<{ id: number; type: string; currency: string; isActive: number; currentBalance: number }>();
    const allAccounts = new Map(accountRows.results.map((item) => [Number(item.id), item]));
    const from = allAccounts.get(body.fromAccountId);
    const to = allAccounts.get(body.toAccountId);
    const oldFrom = current.fromAccountId == null ? null : allAccounts.get(current.fromAccountId);
    const oldTo = current.toAccountId == null ? null : allAccounts.get(current.toAccountId);
    if (!from || !to || !oldFrom || !oldTo)
      throw new ApiAccessError("转账账户不存在或不属于当前账本", 404);
    if ((!from.isActive && from.id !== current.fromAccountId) || (!to.isActive && to.id !== current.toAccountId))
      throw new ApiAccessError("停用账户不能用于新的转账关系", 409);
    if (from.type !== "资产") throw new ApiAccessError("转出账户必须是资产账户", 400);
    if (body.kind === "账户转账" && to.type !== "资产")
      throw new ApiAccessError("账户转账的转入账户必须是资产账户", 400);
    if (body.kind === "信用卡还款" && to.type !== "负债")
      throw new ApiAccessError("信用卡还款应转入负债账户", 400);
    if (from.currency !== to.currency)
      throw new ApiAccessError("转账双方币种必须一致", 400);

    const amount = Math.round(body.amount * 100);
    const reversedBalance = (account: { id: number; currentBalance: number }) =>
      account.currentBalance +
      (account.id === current.fromAccountId ? current.amount : 0) -
      (account.id === current.toAccountId ? current.amount : 0);
    if (from.type === "资产" && reversedBalance(from) < amount)
      throw new ApiAccessError("转出账户余额不足", 409);
    if (to.type === "负债" && reversedBalance(to) + amount > 0)
      throw new ApiAccessError("还款金额超过当前负债", 409);
    const nextUpdatedAt = new Date().toISOString();
    const occurredAt = localDateTimeToUtc(body.occurredAt, body.originalTimezone);
    const result = await db.prepare("UPDATE account_transfers SET kind=?,from_account_id=?,to_account_id=?,amount=?,currency=?,occurred_at=?,original_timezone=?,note=?,updated_at=? WHERE uuid=? AND ledger_id=? AND updated_at=?")
      .bind(body.kind, body.fromAccountId, body.toAccountId, amount, from.currency, occurredAt, body.originalTimezone, body.note ?? "", nextUpdatedAt, body.uuid, body.ledgerId, body.expectedUpdatedAt)
      .run();
    if (Number(result.meta.changes ?? 0) !== 1)
      throw new ApiAccessError("这笔转账已在其他位置更新，请刷新后重试", 409);
    return privateJson({ ok: true, uuid: body.uuid, updatedAt: nextUpdatedAt });
  } catch (error) {
    if (error instanceof Error && /转出账户余额不足|还款金额超过当前负债/u.test(error.message))
      return accessErrorResponse(new ApiAccessError(error.message, 409), "更新转账失败", request);
    return accessErrorResponse(error, "更新转账失败", request);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const body = readTransferDeleteInput(request);
    await claimAndRequireLedger(request, body.ledgerId);
    const db = getDbBinding();
    const current = await loadEditableTransfer(body.ledgerId, body.uuid);
    if (current.updatedAt !== body.expectedUpdatedAt)
      throw new ApiAccessError("这笔转账已在其他位置更新，请刷新后重试", 409);
    const result = await db.prepare("DELETE FROM account_transfers WHERE uuid=? AND ledger_id=? AND updated_at=?")
      .bind(body.uuid, body.ledgerId, body.expectedUpdatedAt)
      .run();
    if (Number(result.meta.changes ?? 0) !== 1)
      throw new ApiAccessError("这笔转账已在其他位置更新，请刷新后重试", 409);
    return privateJson({ ok: true, uuid: body.uuid });
  } catch (error) {
    return accessErrorResponse(error, "删除转账失败", request);
  }
}
