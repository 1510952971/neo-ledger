import { NextResponse } from "next/server";
import { ensureDb, getDbBinding, processDueInstallments } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";

export async function GET(request: Request) {
  const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
  await claimAndRequireLedger(request, ledgerId);
  await processDueInstallments(ledgerId);
  const rows = await getDbBinding()
    .prepare(
      "SELECT id,ledger_id AS ledgerId,name,total_amount AS totalAmount,periods,paid_periods AS paidPeriods,fee_amount AS feeAmount,account_id AS accountId,payment_account_id AS paymentAccountId,start_month AS startMonth,charge_day AS chargeDay,currency,uuid,updated_at AS updatedAt,created_at AS createdAt FROM installments WHERE ledger_id=? ORDER BY id DESC",
    )
    .bind(ledgerId)
    .all();
  return NextResponse.json(rows.results);
}
export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      ledgerId?: number;
      name?: string;
      totalAmount?: number;
      periods?: number;
      feeAmount?: number;
      accountId?: number;
      paymentAccountId?: number;
      startMonth?: string;
      chargeDay?: number;
    };
    const ledgerId = Number(body.ledgerId || 1),
      accountId = Number(body.accountId),
      paymentAccountId = Number(body.paymentAccountId),
      periods = Number(body.periods),
      total = Math.round(Number(body.totalAmount) * 100),
      fee = Math.round(Number(body.feeAmount || 0) * 100),
      day = Number(body.chargeDay || 1),
      name = String(body.name || "")
        .trim()
        .slice(0, 40);
    if (
      !name ||
      !total ||
      !Number.isInteger(periods) ||
      periods < 1 ||
      periods > 360 ||
      day < 1 ||
      day > 31 ||
      !/^\d{4}-\d{2}$/.test(String(body.startMonth))
    )
      throw new Error("请完整填写有效的分期信息");
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding(),
      account = await db
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
    const results = await db.batch([
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
        "INSERT INTO account_transfers(uuid,ledger_id,kind,from_account_id,amount,currency,target_type,target_id,occurred_at,original_timezone,note) VALUES(lower(hex(randomblob(16))),?,'负债入账',?,?,?,'installment',(SELECT id FROM installments WHERE uuid=?),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Asia/Shanghai',?)",
      ).bind(ledgerId, accountId, total + fee, account.currency, installmentUuid, `建立分期 · ${name}`),
    ]);
    await processDueInstallments(ledgerId);
    return NextResponse.json(
      { id: Number(results[0].meta.last_row_id) },
      { status: 201 },
    );
  } catch (error) {
    return accessErrorResponse(error, "创建失败");
  }
}
export async function DELETE(request: Request) {
  await ensureDb();
  const id = Number(new URL(request.url).searchParams.get("id"));
  const used = await getDbBinding()
    .prepare(
      "SELECT i.paid_periods paid,i.total_amount total,i.fee_amount fee,i.account_id accountId,i.ledger_id ledgerId,i.uuid,a.type accountType FROM installments i JOIN accounts a ON a.id=i.account_id WHERE i.id=?",
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
    }>();
  if (!used) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  try {
    await claimAndRequireLedger(request, used.ledgerId);
  } catch (error) {
    return accessErrorResponse(error, "删除失败");
  }
  if (used.paid > 0)
    return NextResponse.json(
      { error: "已有还款流水，不能直接删除" },
      { status: 409 },
    );
  const db = getDbBinding();
  const statements = [
    getDbBinding().prepare("INSERT OR REPLACE INTO sync_tombstones(entity_type,entity_uuid,ledger_id,deleted_at) VALUES('installment',?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(used.uuid, used.ledgerId),
    getDbBinding().prepare("DELETE FROM installments WHERE id=? AND ledger_id=?").bind(id, used.ledgerId),
  ];
  if (used.accountType === "负债") statements.unshift(
    db.prepare("INSERT INTO account_transfers(uuid,ledger_id,kind,to_account_id,amount,currency,target_type,target_id,occurred_at,original_timezone,note) SELECT lower(hex(randomblob(16))),ledger_id,'分期撤销',account_id,total_amount+fee_amount,currency,'installment',id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Asia/Shanghai','撤销未还款分期' FROM installments WHERE id=?").bind(id),
  );
  await db.batch(statements);
  return NextResponse.json({ ok: true });
}
