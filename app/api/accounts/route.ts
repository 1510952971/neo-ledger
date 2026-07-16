import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureDb, getDb, getDbBinding } from "../../../db";
import { accounts } from "../../../db/schema";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";

export const dynamic = "force-dynamic";

type AccountInput = {
  name?: string;
  type?: "资产" | "负债";
  balance?: number;
  billDay?: number | null;
  repaymentDay?: number | null;
  isInvestment?: boolean;
  ledgerId?: number;
  currency?: "CNY" | "USD" | "JPY" | "EUR";
  assetClass?: "现金流" | "固收防守" | "风险进攻";
};

function validate(input: AccountInput) {
  const name = String(input.name ?? "")
    .trim()
    .slice(0, 30);
  const type = input.type;
  const balanceYuan = Number(input.balance);
  if (!name) throw new Error("请输入账户名称");
  if (!(type === "资产" || type === "负债")) throw new Error("请选择账户类型");
  if (!Number.isFinite(balanceYuan) || balanceYuan < 0)
    throw new Error("请输入正确金额");
  const checkDay = (value: number | null | undefined) =>
    value == null || (Number.isInteger(value) && value >= 1 && value <= 31);
  if (
    type === "负债" &&
    (!checkDay(input.billDay) || !checkDay(input.repaymentDay))
  )
    throw new Error("账单日和还款日应为 1—31");
  const absoluteCents = Math.round(balanceYuan * 100);
  return {
    name,
    type,
    currentBalance: type === "负债" ? -Math.abs(absoluteCents) : absoluteCents,
    billDay:
      type === "负债" && input.billDay != null ? Number(input.billDay) : null,
    repaymentDay:
      type === "负债" && input.repaymentDay != null
        ? Number(input.repaymentDay)
        : null,
    isInvestment: type === "资产" && Boolean(input.isInvestment),
    currency: (["CNY", "USD", "JPY", "EUR"] as const).includes(
      input.currency as never,
    )
      ? input.currency!
      : "CNY",
    assetClass: (["现金流", "固收防守", "风险进攻"] as const).includes(
      input.assetClass as never,
    )
      ? input.assetClass!
      : input.isInvestment
        ? "风险进攻"
        : "现金流",
  };
}

export async function GET(request: Request) {
  await ensureDb();
  const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
  await claimAndRequireLedger(request, ledgerId);
  const rows = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.ledgerId, ledgerId))
    .orderBy(accounts.id);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as AccountInput;
    const ledgerId = Number(body.ledgerId) || 1;
    await claimAndRequireLedger(request, ledgerId);
    const value = validate(body);
    const icon = value.isInvestment
      ? "📈"
      : value.type === "负债"
        ? "💳"
        : "💰";
    const result = await getDbBinding()
      .prepare(
        `
      INSERT INTO accounts (ledger_id,name,type,current_balance,bill_day,repayment_day,icon,is_investment,initial_balance,currency,asset_class,uuid,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    `,
      )
      .bind(
        ledgerId,
        value.name,
        value.type,
        value.currentBalance,
        value.billDay,
        value.repaymentDay,
        icon,
        value.isInvestment ? 1 : 0,
        value.currentBalance,
        value.currency,
        value.assetClass,
      )
      .run();
    return NextResponse.json({ id: result.meta.last_row_id }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error, "新增失败");
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as AccountInput & { id?: number };
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("账户不存在");
    const value = validate(body);
    const ledgerId = Number(body.ledgerId) || 1;
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const current = await db
      .prepare("SELECT id,ledger_id AS ledgerId,type,current_balance AS currentBalance,currency,uuid FROM accounts WHERE id=? AND ledger_id=?")
      .bind(id, ledgerId)
      .first<{ id: number; ledgerId: number; type: string; currentBalance: number; currency: string; uuid: string }>();
    if (!current) throw new Error("账户不存在");
    if (current.type !== value.type || current.currency !== value.currency) {
      const activity = await db
        .prepare("SELECT (SELECT COUNT(*) FROM transactions WHERE account_id=?)+(SELECT COUNT(*) FROM account_transfers WHERE from_account_id=? OR to_account_id=?)+(SELECT COUNT(*) FROM installments WHERE account_id=? OR payment_account_id=?) count")
        .bind(id, id, id, id, id)
        .first<{ count: number }>();
      if ((activity?.count ?? 0) > 0)
        throw new Error("已有流水的账户不能直接更改类型或币种，请新建账户后转账");
    }
    const icon = value.isInvestment
      ? "📈"
      : value.type === "负债"
        ? "💳"
        : "💰";
    const statements = [
      db.prepare("UPDATE accounts SET name=?,type=?,bill_day=?,repayment_day=?,is_investment=?,icon=?,currency=?,asset_class=? WHERE id=? AND ledger_id=?")
        .bind(value.name, value.type, value.billDay, value.repaymentDay, value.isInvestment ? 1 : 0, icon, value.currency, value.assetClass, id, ledgerId),
    ];
    const balanceDelta = value.currentBalance - current.currentBalance;
    if (balanceDelta !== 0)
      statements.push(
        db.prepare("INSERT INTO account_transfers(uuid,ledger_id,kind,from_account_id,to_account_id,amount,currency,target_type,target_id,occurred_at,original_timezone,note) VALUES(lower(hex(randomblob(16))),?,'余额调账',?,?,?,?,'account',?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Asia/Shanghai','手动校准账户余额')")
          .bind(ledgerId, balanceDelta < 0 ? id : null, balanceDelta > 0 ? id : null, Math.abs(balanceDelta), value.currency, id),
      );
    await db.batch(statements);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "修改失败");
  }
}

export async function DELETE(request: Request) {
  try {
  await ensureDb();
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: "账户不存在" }, { status: 400 });
  const db = getDbBinding();
  const account = await db.prepare("SELECT ledger_id ledgerId,uuid FROM accounts WHERE id=?").bind(id).first<{ ledgerId: number; uuid: string }>();
  if (!account) throw new Error("账户不存在");
  await claimAndRequireLedger(request, account.ledgerId);
  const used = await db
    .prepare("SELECT COUNT(*) AS count FROM transactions WHERE account_id=?")
    .bind(id)
    .first<{ count: number }>();
  if ((used?.count ?? 0) > 0)
    return NextResponse.json(
      { error: "该账户已有账单，不能注销；请先删除关联账单。" },
      { status: 409 },
    );
  const plans = await db
    .prepare("SELECT COUNT(*) count FROM installments WHERE account_id=? OR payment_account_id=?")
    .bind(id, id)
    .first<{ count: number }>();
  if ((plans?.count ?? 0) > 0)
    return NextResponse.json(
      { error: "该账户绑定了分期项目，不能注销。" },
      { status: 409 },
    );
  const dependencies = await db.prepare("SELECT (SELECT COUNT(*) FROM subscriptions WHERE account_id=?)+(SELECT COUNT(*) FROM pending_transactions WHERE account_id=?)+(SELECT COUNT(*) FROM account_transfers WHERE from_account_id=? OR to_account_id=?) count").bind(id, id, id, id).first<{ count: number }>();
  if ((dependencies?.count ?? 0) > 0)
    return NextResponse.json({ error: "该账户仍被续费、待确认流水或转账记录引用，不能注销。" }, { status: 409 });
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO sync_tombstones(entity_type,entity_uuid,ledger_id,deleted_at) VALUES('account',?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(account.uuid, account.ledgerId),
    db.prepare("DELETE FROM accounts WHERE id=? AND ledger_id=?").bind(id, account.ledgerId),
  ]);
  return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "注销失败");
  }
}
