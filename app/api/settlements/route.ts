import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      ledgerId?: number;
      memberId?: number;
      amount?: number;
      direction?: "owesMe" | "iOwe";
    };
    const ledgerId = Number(body.ledgerId),
      memberId = Number(body.memberId),
      amount = Math.round(Number(body.amount));
    if (!ledgerId || !memberId || !amount) throw new Error("平账参数不完整");
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const me = await db
      .prepare("SELECT id FROM members WHERE ledger_id=? AND is_me=1")
      .bind(ledgerId)
      .first<{ id: number }>();
    const account = await db
      .prepare(
        "SELECT id,currency FROM accounts WHERE ledger_id=? AND type='资产' AND currency='CNY' ORDER BY id LIMIT 1",
      )
      .bind(ledgerId)
      .first<{ id: number; currency: string }>();
    if (!me || !account) throw new Error("请先准备人民币资产账户");
    const occurredAt = new Date().toISOString();
    await db.batch([
      db.prepare("INSERT INTO account_transfers(uuid,ledger_id,kind,from_account_id,to_account_id,amount,currency,target_type,target_id,occurred_at,original_timezone,note) VALUES(lower(hex(randomblob(16))),?,'人情平账',?,?,?,?,'member',?,?,'Asia/Shanghai',?)")
        .bind(ledgerId, body.direction === "iOwe" ? account.id : null, body.direction === "owesMe" ? account.id : null, amount, account.currency, memberId, occurredAt, body.direction === "owesMe" ? "对方还款" : "向对方还款"),
      db.prepare("INSERT INTO transactions (ledger_id,title,amount,type,mood,category,category_dynamic,income_category,income_category_dynamic,account_id,paid_by_member_id,split_with_member_id,split_mode,my_share_percent,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,occurred_at) VALUES (?,'人情平账',?,?,?,?,?,?,?,?,?,?,'人情平账',?,?,?,?,1000000,'Asia/Shanghai',?)")
        .bind(ledgerId, amount, body.direction === "owesMe" ? "收入" : "支出", body.direction === "iOwe" ? "刚需" : null, body.direction === "iOwe" ? "购物" : null, body.direction === "iOwe" ? "购物" : null, body.direction === "owesMe" ? "其它收入" : null, body.direction === "owesMe" ? "其它收入" : null, account.id, body.direction === "owesMe" ? memberId : me.id, body.direction === "owesMe" ? me.id : memberId, body.direction === "owesMe" ? 0 : 100, account.currency, amount, account.currency, occurredAt),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "平账失败");
  }
}
