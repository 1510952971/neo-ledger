import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { createAccountTransfer } from "../../../db/transfers";
import { ApiAccessError, accessErrorResponse, claimAndRequireLedger } from "../../api-security";
import { readTransferInput } from "../../internal-api-contract";

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
    await claimAndRequireLedger(request, ledgerId);
    const rows = await getDbBinding()
      .prepare("SELECT uuid,ledger_id AS ledgerId,kind,from_account_id AS fromAccountId,to_account_id AS toAccountId,amount,currency,target_type AS targetType,target_id AS targetId,occurrence_key AS occurrenceKey,occurred_at AS occurredAt,original_timezone AS originalTimezone,note,updated_at AS updatedAt FROM account_transfers WHERE ledger_id=? ORDER BY occurred_at DESC LIMIT 500")
      .bind(ledgerId)
      .all();
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
      results: Array<{ id: number; type: string; currency: string }>;
    } = await db
      .prepare("SELECT id,type,currency FROM accounts WHERE ledger_id=? AND id IN (?,?)")
      .bind(ledgerId, fromAccountId, toAccountId)
      .all<{ id: number; type: string; currency: string }>();
    const from = accounts.results.find((row) => row.id === fromAccountId);
    const to = accounts.results.find((row) => row.id === toAccountId);
    if (!from || !to) throw new Error("转账账户不存在");
    if (from.currency !== to.currency) throw new Error("跨币种账户请先换汇，不能直接转账");
    if (kind === "信用卡还款" && (from.type !== "资产" || to.type !== "负债"))
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
