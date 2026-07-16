import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { createAccountTransfer } from "../../../db/transfers";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";
import {
  calculateGoalContribution,
  isValidDateKey,
  toPositiveCents,
} from "./rules.js";

type GoalRow = {
  id: number;
  ledgerId: number;
  targetAmount: number;
  savedAmount: number;
};

export async function GET(request: Request) {
  await ensureDb();
  const requestedLedger = Number(new URL(request.url).searchParams.get("ledger"));
  const ledgerId = Number.isInteger(requestedLedger) && requestedLedger > 0
    ? requestedLedger
    : 1;
  await claimAndRequireLedger(request, ledgerId);
  const rows = await getDbBinding()
    .prepare(
      "SELECT id,ledger_id AS ledgerId,name,target_amount AS targetAmount,saved_amount AS savedAmount,deadline,icon,uuid,updated_at AS updatedAt,created_at AS createdAt FROM savings_goals WHERE ledger_id=? ORDER BY id",
    )
    .bind(ledgerId)
    .all();
  return NextResponse.json(rows.results);
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as Record<string, unknown>;
    const ledgerId = Number(body.ledgerId);
    const name = String(body.name ?? "").trim().slice(0, 30);
    const targetAmount = toPositiveCents(body.targetAmount, "请输入目标金额");
    const deadline = String(body.deadline ?? "");
    const icon = String(body.icon ?? "🌟").trim().slice(0, 4) || "🌟";
    if (!Number.isInteger(ledgerId) || ledgerId <= 0)
      throw new Error("账本不存在");
    await claimAndRequireLedger(request, ledgerId);
    if (!name) throw new Error("请输入心愿名称");
    if (!isValidDateKey(deadline)) throw new Error("请选择正确的截止日期");

    await getDbBinding()
      .prepare(
        "INSERT INTO savings_goals (ledger_id,name,target_amount,deadline,icon,uuid,updated_at) VALUES (?,?,?,?,?,lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
      )
      .bind(ledgerId, name, targetAmount, deadline, icon)
      .run();
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error, "保存失败");
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as Record<string, unknown>;
    const id = Number(body.id);
    const accountId = Number(body.accountId);
    const requestedAmount = toPositiveCents(body.amount, "请输入存入金额");
    if (!Number.isInteger(id) || id <= 0) throw new Error("心愿不存在");
    if (!Number.isInteger(accountId) || accountId <= 0)
      throw new Error("请选择资产账户");

    const db = getDbBinding();
    const goal = await db
      .prepare(
        "SELECT id,ledger_id AS ledgerId,target_amount AS targetAmount,saved_amount AS savedAmount FROM savings_goals WHERE id=?",
      )
      .bind(id)
      .first<GoalRow>();
    if (!goal) throw new Error("心愿不存在");
    await claimAndRequireLedger(request, goal.ledgerId);

    const account = await db
      .prepare(
        "SELECT current_balance AS balance,currency FROM accounts WHERE id=? AND ledger_id=? AND type='资产'",
      )
      .bind(accountId, goal.ledgerId)
      .first<{ balance: number; currency: string }>();
    if (!account) throw new Error("资产账户不存在");

    const contribution = calculateGoalContribution({
      targetAmount: goal.targetAmount,
      savedAmount: goal.savedAmount,
      requestedAmount,
      accountBalance: account.balance,
    });
    await createAccountTransfer({
      ledgerId: goal.ledgerId,
      kind: "储蓄存入",
      fromAccountId: accountId,
      amount: contribution.appliedAmount,
      currency: account.currency,
      targetType: "savings-goal",
      targetId: id,
      note: "转入心愿储蓄罐",
    });
    return NextResponse.json({ ok: true, ...contribution });
  } catch (error) {
    return accessErrorResponse(error, "存入失败");
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as Record<string, unknown>;
    const id = Number(body.id);
    const accountId = Number(body.accountId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("心愿不存在");

    const db = getDbBinding();
    const goal = await db
      .prepare(
        "SELECT id,ledger_id AS ledgerId,target_amount AS targetAmount,saved_amount AS savedAmount,uuid FROM savings_goals WHERE id=?",
      )
      .bind(id)
      .first<GoalRow & { uuid: string }>();
    if (!goal) throw new Error("心愿不存在");
    await claimAndRequireLedger(request, goal.ledgerId);

    if (goal.savedAmount > 0) {
      if (!Number.isInteger(accountId) || accountId <= 0)
        throw new Error("请选择退款账户");
      const account = await db
        .prepare(
          "SELECT id,currency FROM accounts WHERE id=? AND ledger_id=? AND type='资产'",
        )
        .bind(accountId, goal.ledgerId)
        .first<{ id: number; currency: string }>();
      if (!account) throw new Error("退款账户不存在");
      await createAccountTransfer({
        ledgerId: goal.ledgerId,
        kind: "储蓄退款",
        toAccountId: accountId,
        amount: goal.savedAmount,
        currency: account.currency,
        targetType: "savings-goal",
        targetId: id,
        note: "删除心愿并退回储蓄",
      });
    }
    await db.batch([
      db.prepare("INSERT OR REPLACE INTO sync_tombstones(entity_type,entity_uuid,ledger_id,deleted_at) VALUES('savings-goal',?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(goal.uuid, goal.ledgerId),
      db.prepare("DELETE FROM savings_goals WHERE id=? AND ledger_id=?").bind(id, goal.ledgerId),
    ]);

    return NextResponse.json({ ok: true, refundedAmount: goal.savedAmount });
  } catch (error) {
    return accessErrorResponse(error, "删除失败");
  }
}
