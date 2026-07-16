import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { createAccountTransfer, TransferKind } from "../../../db/transfers";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";

const allowedKinds = new Set<TransferKind>(["账户转账", "信用卡还款"]);

export async function GET(request: Request) {
  try {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
    await claimAndRequireLedger(request, ledgerId);
    const rows = await getDbBinding()
      .prepare("SELECT uuid,ledger_id AS ledgerId,kind,from_account_id AS fromAccountId,to_account_id AS toAccountId,amount,currency,target_type AS targetType,target_id AS targetId,occurrence_key AS occurrenceKey,occurred_at AS occurredAt,original_timezone AS originalTimezone,note,updated_at AS updatedAt FROM account_transfers WHERE ledger_id=? ORDER BY occurred_at DESC LIMIT 500")
      .bind(ledgerId)
      .all();
    return NextResponse.json(rows.results);
  } catch (error) {
    return accessErrorResponse(error, "读取转账记录失败");
  }
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      ledgerId?: number;
      kind?: TransferKind;
      fromAccountId?: number;
      toAccountId?: number;
      amount?: number;
      occurredAt?: string;
      originalTimezone?: string;
      note?: string;
    };
    const ledgerId = Number(body.ledgerId);
    const fromAccountId = Number(body.fromAccountId);
    const toAccountId = Number(body.toAccountId);
    const amount = Math.round(Number(body.amount) * 100);
    const kind = body.kind === "信用卡还款" ? "信用卡还款" : "账户转账";
    if (!allowedKinds.has(kind) || !amount || amount < 0)
      throw new Error("请输入正确的转账金额");
    if (!Number.isInteger(fromAccountId) || !Number.isInteger(toAccountId) || fromAccountId === toAccountId)
      throw new Error("请选择不同的转出和转入账户");
    await claimAndRequireLedger(request, ledgerId);
    const accounts = await getDbBinding()
      .prepare("SELECT id,type,currency FROM accounts WHERE ledger_id=? AND id IN (?,?)")
      .bind(ledgerId, fromAccountId, toAccountId)
      .all<{ id: number; type: string; currency: string }>();
    const from = accounts.results.find((row) => row.id === fromAccountId);
    const to = accounts.results.find((row) => row.id === toAccountId);
    if (!from || !to) throw new Error("转账账户不存在");
    if (from.currency !== to.currency) throw new Error("跨币种账户请先换汇，不能直接转账");
    if (kind === "信用卡还款" && (from.type !== "资产" || to.type !== "负债"))
      throw new Error("信用卡还款应从资产账户转入负债账户");
    const uuid = await createAccountTransfer({
      ledgerId,
      kind,
      fromAccountId,
      toAccountId,
      amount,
      currency: from.currency,
      occurredAt: body.occurredAt,
      originalTimezone: body.originalTimezone,
      note: body.note,
    });
    return NextResponse.json({ ok: true, uuid }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error, "转账失败");
  }
}
