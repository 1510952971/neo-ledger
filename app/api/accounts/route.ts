import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureDb, getDb, getDbBinding } from "../../../db";
import { accounts } from "../../../db/schema";
import { ApiAccessError, accessErrorResponse, claimAndRequireLedger } from "../../api-security";
import {
  readAccountCreateInput,
  readAccountUpdateInput,
  type AccountInput,
} from "../../internal-api-contract";
import { MAX_ACCOUNT_COUNT } from "../../account-limits";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

function validate(input: AccountInput) {
  const absoluteCents = Math.round(input.balance * 100);
  return {
    name: input.name,
    type: input.type,
    currentBalance: input.type === "负债" ? -Math.abs(absoluteCents) : absoluteCents,
    billDay:
      input.type === "负债" && input.billDay != null ? input.billDay : null,
    repaymentDay:
      input.type === "负债" && input.repaymentDay != null
        ? input.repaymentDay
        : null,
    isInvestment: input.type === "资产" && input.isInvestment,
    currency: input.currency,
    assetClass: input.assetClass
      ? input.assetClass
      : input.isInvestment
        ? "风险进攻"
        : "现金流",
  };
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
    await claimAndRequireLedger(request, ledgerId);
    const total = await getDbBinding()
      .prepare("SELECT COUNT(*) count FROM accounts WHERE ledger_id=?")
      .bind(ledgerId)
      .first<{ count: number }>();
    const rows = await getDb()
      .select()
      .from(accounts)
      .where(eq(accounts.ledgerId, ledgerId))
      .orderBy(accounts.id)
      .limit(MAX_ACCOUNT_COUNT);
    const response = privateJson(rows);
    const totalCount = Number(total?.count ?? 0);
    response.headers.set("X-Total-Count", String(totalCount));
    response.headers.set("X-Has-More", totalCount > MAX_ACCOUNT_COUNT ? "1" : "0");
    return response;
  } catch (error) {
    return accessErrorResponse(error, "读取账户失败", request);
  }
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await readAccountCreateInput(request);
    const ledgerId = body.ledgerId;
    await claimAndRequireLedger(request, ledgerId);
    const count = await getDbBinding()
      .prepare("SELECT COUNT(*) count FROM accounts WHERE ledger_id=?")
      .bind(ledgerId)
      .first<{ count: number }>();
    if (Number(count?.count ?? 0) >= MAX_ACCOUNT_COUNT)
      throw new ApiAccessError("账户最多 " + MAX_ACCOUNT_COUNT + " 个", 409);
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
    return privateJson({ id: result.meta.last_row_id }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error, "新增失败", request);
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = await readAccountUpdateInput(request);
    const id = body.id;
    const value = validate(body);
    const ledgerId = body.ledgerId;
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const current = await db
      .prepare("SELECT id,ledger_id AS ledgerId,type,current_balance AS currentBalance,currency,uuid,updated_at AS updatedAt FROM accounts WHERE id=? AND ledger_id=?")
      .bind(id, ledgerId)
      .first<{ id: number; ledgerId: number; type: string; currentBalance: number; currency: string; uuid: string; updatedAt: string }>();
    if (!current) throw new Error("账户不存在");
    if (current.updatedAt !== body.expectedUpdatedAt)
      throw new ApiAccessError("账户已被其他操作更新，请刷新后重试", 409);
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
    const nextUpdatedAt = new Date().toISOString();
    const statements = [
      db.prepare("UPDATE accounts SET name=?,type=?,bill_day=?,repayment_day=?,is_investment=?,icon=?,currency=?,asset_class=?,updated_at=? WHERE id=? AND ledger_id=? AND updated_at=?")
        .bind(value.name, value.type, value.billDay, value.repaymentDay, value.isInvestment ? 1 : 0, icon, value.currency, value.assetClass, nextUpdatedAt, id, ledgerId, body.expectedUpdatedAt),
    ];
    const balanceDelta = value.currentBalance - current.currentBalance;
    if (balanceDelta !== 0)
      statements.push(
        db.prepare("INSERT INTO account_transfers(uuid,ledger_id,kind,from_account_id,to_account_id,amount,currency,target_type,target_id,occurrence_key,occurred_at,original_timezone,note) SELECT lower(hex(randomblob(16))),?,'余额调账',?,?,?,?,'account',?,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Asia/Shanghai','手动校准账户余额' FROM accounts WHERE id=? AND ledger_id=? AND updated_at=?")
          .bind(ledgerId, balanceDelta < 0 ? id : null, balanceDelta > 0 ? id : null, Math.abs(balanceDelta), value.currency, id, id, ledgerId, nextUpdatedAt),
      );
    const results = await db.batch(statements);
    if (!Number(results[0]?.meta?.changes ?? 0))
      throw new ApiAccessError("账户已被其他操作更新，请刷新后重试", 409);
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "修改失败", request);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    const expectedUpdatedAt = url.searchParams.get("expectedUpdatedAt")?.trim() ?? "";
    if (!Number.isInteger(id) || id <= 0)
      return privateJson({ error: "账户不存在" }, { status: 400 });
    if (!expectedUpdatedAt || expectedUpdatedAt.length > 64)
      throw new ApiAccessError("账户版本无效，请刷新后重试", 409);
    const db = getDbBinding();
    const account = await db.prepare("SELECT ledger_id ledgerId,uuid,updated_at updatedAt FROM accounts WHERE id=?").bind(id).first<{ ledgerId: number; uuid: string; updatedAt: string }>();
    if (!account) throw new Error("账户不存在");
    await claimAndRequireLedger(request, account.ledgerId);
    if (account.updatedAt !== expectedUpdatedAt)
      throw new ApiAccessError("账户已被其他操作更新，请刷新后重试", 409);
    const used = await db
      .prepare("SELECT COUNT(*) AS count FROM transactions WHERE account_id=?")
      .bind(id)
      .first<{ count: number }>();
    if ((used?.count ?? 0) > 0)
      return privateJson(
        { error: "该账户已有账单，不能注销；请先删除关联账单。" },
        { status: 409 },
      );
    const plans = await db
      .prepare("SELECT COUNT(*) count FROM installments WHERE account_id=? OR payment_account_id=?")
      .bind(id, id)
      .first<{ count: number }>();
    if ((plans?.count ?? 0) > 0)
      return privateJson(
        { error: "该账户绑定了分期项目，不能注销。" },
        { status: 409 },
      );
    const dependencies = await db.prepare("SELECT (SELECT COUNT(*) FROM subscriptions WHERE account_id=?)+(SELECT COUNT(*) FROM pending_transactions WHERE account_id=?)+(SELECT COUNT(*) FROM account_transfers WHERE from_account_id=? OR to_account_id=?) count").bind(id, id, id, id).first<{ count: number }>();
    if ((dependencies?.count ?? 0) > 0)
      return privateJson({ error: "该账户仍被续费、待确认流水或转账记录引用，不能注销。" }, { status: 409 });
    const dependencyPredicate = "NOT EXISTS (SELECT 1 FROM transactions WHERE account_id=?) AND NOT EXISTS (SELECT 1 FROM installments WHERE account_id=? OR payment_account_id=?) AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE account_id=?) AND NOT EXISTS (SELECT 1 FROM pending_transactions WHERE account_id=?) AND NOT EXISTS (SELECT 1 FROM account_transfers WHERE from_account_id=? OR to_account_id=?)";
    const results = await db.batch([
      db.prepare(`INSERT OR REPLACE INTO sync_tombstones(entity_type,entity_uuid,ledger_id,deleted_at) SELECT 'account',uuid,ledger_id,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM accounts WHERE id=? AND ledger_id=? AND updated_at=? AND ${dependencyPredicate}`).bind(id, account.ledgerId, expectedUpdatedAt, id, id, id, id, id, id, id),
      db.prepare(`DELETE FROM accounts WHERE id=? AND ledger_id=? AND updated_at=? AND ${dependencyPredicate}`).bind(id, account.ledgerId, expectedUpdatedAt, id, id, id, id, id, id, id),
    ]);
    if (!Number(results[1]?.meta?.changes ?? 0))
      throw new ApiAccessError("账户已被更新或仍被其他数据引用，请刷新后重试", 409);
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "注销失败", request);
  }
}
