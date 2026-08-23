import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { ApiAccessError, accessErrorResponse, claimAndRequireLedger } from "../../api-security";
import { readSettlementInput } from "../../internal-api-contract";

function privateJson(body: unknown) {
  const headers = new Headers({
    "Cache-Control": "no-store, private, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  return NextResponse.json(body, { headers });
}

type ExistingSettlement = {
  uuid: string;
  memberId: number | null;
  amount: number;
  fromAccountId: number | null;
  toAccountId: number | null;
};

function duplicateSettlementResponse(existing: ExistingSettlement, body: {
  memberId: number;
  amount: number;
  direction: "owesMe" | "iOwe";
}) {
  const sameDirection = body.direction === "iOwe"
    ? existing.fromAccountId !== null && existing.toAccountId === null
    : existing.fromAccountId === null && existing.toAccountId !== null;
  if (existing.memberId !== body.memberId || existing.amount !== body.amount || !sameDirection)
    throw new ApiAccessError("幂等键已经用于其他平账操作", 409);
  return privateJson({ ok: true, duplicate: true, uuid: existing.uuid });
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await readSettlementInput(request);
    const { ledgerId, memberId, amount } = body;
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const occurrenceKey = body.idempotencyKey
      ? `manual:${ownerId}:settlement:${body.idempotencyKey}`
      : null;
    if (occurrenceKey) {
      const existing = await db
        .prepare("SELECT uuid,target_id memberId,amount,from_account_id fromAccountId,to_account_id toAccountId FROM account_transfers WHERE ledger_id=? AND occurrence_key=?")
        .bind(ledgerId, occurrenceKey)
        .first<ExistingSettlement>();
      if (existing)
        return duplicateSettlementResponse(existing, body);
    }
    const me = await db
      .prepare("SELECT id FROM members WHERE ledger_id=? AND is_me=1")
      .bind(ledgerId)
      .first<{ id: number }>();
    const partner = await db
      .prepare(
        "SELECT id FROM members WHERE id=? AND ledger_id=? AND is_me=0",
      )
      .bind(memberId, ledgerId)
      .first<{ id: number }>();
    const account = await db
      .prepare(
        "SELECT id,currency FROM accounts WHERE ledger_id=? AND type='资产' AND currency='CNY' ORDER BY id LIMIT 1",
      )
      .bind(ledgerId)
      .first<{ id: number; currency: string }>();
    if (!partner) throw new Error("分账搭子不存在或不属于当前账本");
    if (!me || !account) throw new Error("请先准备人民币资产账户");
    const occurredAt = new Date().toISOString();
    try {
      const transfer = db
        .prepare("INSERT INTO account_transfers(uuid,ledger_id,kind,from_account_id,to_account_id,amount,currency,target_type,target_id,occurrence_key,occurred_at,original_timezone,note) VALUES(lower(hex(randomblob(16))),?,'人情平账',?,?,?,?,'member',?,?,?,'Asia/Shanghai',?)")
        .bind(ledgerId, body.direction === "iOwe" ? account.id : null, body.direction === "owesMe" ? account.id : null, amount, account.currency, memberId, occurrenceKey, occurredAt, body.direction === "owesMe" ? "对方还款" : "向对方还款");
      const transaction = db
        .prepare("INSERT INTO transactions (ledger_id,title,amount,type,mood,category,category_dynamic,income_category,income_category_dynamic,account_id,paid_by_member_id,split_with_member_id,split_mode,my_share_percent,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,occurrence_key,occurred_at) VALUES (?,'人情平账',?,?,?,?,?,?,?,?,?,?,'人情平账',?,?,?,?,1000000,'Asia/Shanghai',?,?)")
        .bind(ledgerId, amount, body.direction === "owesMe" ? "收入" : "支出", body.direction === "iOwe" ? "刚需" : null, body.direction === "iOwe" ? "购物" : null, body.direction === "iOwe" ? "购物" : null, body.direction === "owesMe" ? "其它收入" : null, body.direction === "owesMe" ? "其它收入" : null, account.id, body.direction === "owesMe" ? partner.id : me.id, partner.id, body.direction === "owesMe" ? 0 : 100, account.currency, amount, account.currency, occurrenceKey, occurredAt);
      await db.batch([transfer, transaction]);
    } catch (error) {
      if (occurrenceKey && error instanceof Error && /unique|constraint/iu.test(error.message)) {
        const existing = await db
          .prepare("SELECT uuid,target_id memberId,amount,from_account_id fromAccountId,to_account_id toAccountId FROM account_transfers WHERE ledger_id=? AND occurrence_key=?")
          .bind(ledgerId, occurrenceKey)
          .first<ExistingSettlement>();
        if (existing)
          return duplicateSettlementResponse(existing, body);
      }
      throw error;
    }
    const created = occurrenceKey
      ? await db
          .prepare("SELECT uuid FROM account_transfers WHERE ledger_id=? AND occurrence_key=?")
          .bind(ledgerId, occurrenceKey)
          .first<{ uuid: string }>()
      : null;
    return privateJson({ ok: true, duplicate: false, uuid: created?.uuid ?? null });
  } catch (error) {
    return accessErrorResponse(error, "平账失败", request);
  }
}
