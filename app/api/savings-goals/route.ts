import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { createAccountTransfer } from "../../../db/transfers";
import { ApiAccessError, accessErrorResponse, claimAndRequireLedger, guardedApiResponse, requestOwnerId } from "../../api-security";
import { readGoalContributionInput, readGoalCreateInput, readGoalDeleteInput } from "../../internal-api-contract";
import { MAX_SAVINGS_GOAL_COUNT } from "../../planning-limits";
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
  updatedAt: string;
};

type ExistingGoalContribution = {
  uuid: string;
  fromAccountId: number | null;
  targetId: number | null;
  amount: number;
};

type ExistingGoalRefund = {
  uuid: string;
  ledgerId: number;
  toAccountId: number | null;
  targetId: number | null;
  amount: number;
};

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

function duplicateContributionResponse(
  existing: ExistingGoalContribution,
  goal: GoalRow,
  accountId: number,
  requestedAmount: number,
) {
  if (
    existing.fromAccountId !== accountId ||
    existing.targetId !== goal.id ||
    existing.amount !== requestedAmount
  )
    throw new ApiAccessError("幂等键已经用于其他储蓄存入", 409);
  return privateJson({
    ok: true,
    duplicate: true,
    appliedAmount: existing.amount,
    completed: goal.savedAmount >= goal.targetAmount,
  });
}

function duplicateRefundResponse(
  existing: ExistingGoalRefund,
  goalId: number,
  accountId: number,
  refundedAmount: number,
) {
  if (
    existing.toAccountId !== accountId ||
    existing.targetId !== goalId ||
    existing.amount !== refundedAmount
  )
    throw new ApiAccessError("幂等键已经用于其他储蓄退款", 409);
  return privateJson({ ok: true, duplicate: true, refundedAmount });
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取储蓄目标失败", async () => {
    await ensureDb();
    const requestedLedger = Number(new URL(request.url).searchParams.get("ledger"));
    const ledgerId = Number.isInteger(requestedLedger) && requestedLedger > 0
      ? requestedLedger
      : 1;
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const total = await db
      .prepare("SELECT COUNT(*) count FROM savings_goals WHERE ledger_id=?")
      .bind(ledgerId)
      .first<{ count: number }>();
    const rows = await db
      .prepare(
        "SELECT id,ledger_id AS ledgerId,name,target_amount AS targetAmount,saved_amount AS savedAmount,deadline,icon,uuid,updated_at AS updatedAt,created_at AS createdAt FROM savings_goals WHERE ledger_id=? ORDER BY id LIMIT ?",
      )
      .bind(ledgerId, MAX_SAVINGS_GOAL_COUNT)
      .all();
    const response = privateJson(rows.results);
    const totalCount = Number(total?.count ?? 0);
    response.headers.set("X-Total-Count", String(totalCount));
    response.headers.set("X-Has-More", totalCount > MAX_SAVINGS_GOAL_COUNT ? "1" : "0");
    return response;
  });
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await readGoalCreateInput(request);
    const ledgerId = body.ledgerId;
    const name = body.name;
    const targetAmount = toPositiveCents(body.targetAmount, "请输入目标金额");
    const deadline = body.deadline;
    const icon = body.icon;
    await claimAndRequireLedger(request, ledgerId);
    if (!isValidDateKey(deadline)) throw new Error("请选择正确的截止日期");
    const db = getDbBinding();
    const count = await db
      .prepare("SELECT COUNT(*) count FROM savings_goals WHERE ledger_id=?")
      .bind(ledgerId)
      .first<{ count: number }>();
    if (Number(count?.count ?? 0) >= MAX_SAVINGS_GOAL_COUNT)
      throw new ApiAccessError("储蓄目标最多 " + MAX_SAVINGS_GOAL_COUNT + " 个", 409);

    await db
      .prepare(
        "INSERT INTO savings_goals (ledger_id,name,target_amount,deadline,icon,uuid,updated_at) VALUES (?,?,?,?,?,lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
      )
      .bind(ledgerId, name, targetAmount, deadline, icon)
      .run();
    return privateJson({ ok: true }, { status: 201 });
  } catch (error) {
    return accessErrorResponse(error, "保存失败", request);
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureDb();
    const body = await readGoalContributionInput(request);
    const id = body.id;
    const accountId = body.accountId;
    const requestedAmount = toPositiveCents(body.amount, "请输入存入金额");

    const db = getDbBinding();
    const goal = await db
      .prepare(
        "SELECT id,ledger_id AS ledgerId,target_amount AS targetAmount,saved_amount AS savedAmount,updated_at AS updatedAt FROM savings_goals WHERE id=?",
      )
      .bind(id)
      .first<GoalRow>();
    if (!goal) throw new Error("心愿不存在");
    const ownerId = await claimAndRequireLedger(request, goal.ledgerId);
    const occurrenceKey = body.idempotencyKey
      ? `manual:${ownerId}:goal-contribution:${id}:${body.idempotencyKey}`
      : null;
    if (occurrenceKey) {
      const existing = await db
        .prepare("SELECT uuid,from_account_id fromAccountId,target_id targetId,amount FROM account_transfers WHERE ledger_id=? AND occurrence_key=?")
        .bind(goal.ledgerId, occurrenceKey)
        .first<ExistingGoalContribution>();
      if (existing) return duplicateContributionResponse(existing, goal, accountId, requestedAmount);
    }

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
    try {
      await createAccountTransfer({
        ledgerId: goal.ledgerId,
        kind: "储蓄存入",
        fromAccountId: accountId,
        amount: contribution.appliedAmount,
        currency: account.currency,
        targetType: "savings-goal",
        targetId: id,
        occurrenceKey,
        note: "转入心愿储蓄罐",
      });
    } catch (error) {
      if (occurrenceKey && error instanceof Error && /unique|constraint/iu.test(error.message)) {
        const existing = await db
          .prepare("SELECT uuid,from_account_id fromAccountId,target_id targetId,amount FROM account_transfers WHERE ledger_id=? AND occurrence_key=?")
          .bind(goal.ledgerId, occurrenceKey)
          .first<ExistingGoalContribution>();
        if (existing) return duplicateContributionResponse(existing, goal, accountId, requestedAmount);
      }
      throw error;
    }
    return privateJson({ ok: true, duplicate: false, ...contribution });
  } catch (error) {
    return accessErrorResponse(error, "存入失败", request);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const body = await readGoalDeleteInput(request);
    const id = body.id;
    const accountId = body.accountId;

    const db = getDbBinding();
    const ownerId = await requestOwnerId(request);
    const occurrenceKey = body.idempotencyKey
      ? `manual:${ownerId}:goal-refund:${id}:${body.idempotencyKey}`
      : null;
    if (occurrenceKey) {
      const existing = await db
        .prepare("SELECT t.uuid,t.ledger_id ledgerId,t.to_account_id toAccountId,t.target_id targetId,t.amount FROM account_transfers t JOIN ledgers l ON l.id=t.ledger_id WHERE l.owner_id=? AND t.occurrence_key=? AND t.kind='储蓄退款'")
        .bind(ownerId, occurrenceKey)
        .first<ExistingGoalRefund>();
      if (existing) {
        await claimAndRequireLedger(request, existing.ledgerId);
        return duplicateRefundResponse(existing, id, accountId, existing.amount);
      }
    }
    const goal = await db
      .prepare(
        "SELECT id,ledger_id AS ledgerId,target_amount AS targetAmount,saved_amount AS savedAmount,uuid,updated_at AS updatedAt FROM savings_goals WHERE id=?",
      )
      .bind(id)
      .first<GoalRow & { uuid: string }>();
    if (!goal) throw new Error("心愿不存在");
    await claimAndRequireLedger(request, goal.ledgerId);
    if (goal.updatedAt !== body.expectedUpdatedAt)
      throw new ApiAccessError("心愿已被其他操作更新，请刷新后重试", 409);
    if (occurrenceKey && goal.savedAmount > 0) {
      const existing = await db
        .prepare("SELECT uuid,ledger_id ledgerId,to_account_id toAccountId,target_id targetId,amount FROM account_transfers WHERE ledger_id=? AND occurrence_key=?")
        .bind(goal.ledgerId, occurrenceKey)
        .first<ExistingGoalRefund>();
      if (existing)
        return duplicateRefundResponse(existing, id, accountId, goal.savedAmount);
    }

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
      const results = await db.batch([
        db.prepare("INSERT INTO account_transfers(uuid,ledger_id,kind,from_account_id,to_account_id,amount,currency,target_type,target_id,occurrence_key,occurred_at,original_timezone,note) SELECT lower(hex(randomblob(16))),g.ledger_id,'储蓄退款',NULL,?,g.saved_amount,?,'savings-goal',g.id,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Asia/Shanghai','删除心愿并退回储蓄' FROM savings_goals g WHERE g.id=? AND g.ledger_id=? AND g.updated_at=? AND g.saved_amount=?").bind(accountId, account.currency, occurrenceKey, id, goal.ledgerId, goal.updatedAt, goal.savedAmount),
        db.prepare("INSERT OR REPLACE INTO sync_tombstones(entity_type,entity_uuid,ledger_id,deleted_at) SELECT 'savings-goal',uuid,ledger_id,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM savings_goals WHERE id=? AND ledger_id=? AND changes()>0").bind(id, goal.ledgerId),
        db.prepare("DELETE FROM savings_goals WHERE id=? AND ledger_id=? AND changes()>0").bind(id, goal.ledgerId),
      ]);
      if (!Number(results.at(-1)?.meta?.changes ?? 0)) {
        if (occurrenceKey) {
          const existing = await db
            .prepare("SELECT uuid,ledger_id ledgerId,to_account_id toAccountId,target_id targetId,amount FROM account_transfers WHERE ledger_id=? AND occurrence_key=?")
            .bind(goal.ledgerId, occurrenceKey)
            .first<ExistingGoalRefund>();
          if (existing) return duplicateRefundResponse(existing, id, accountId, goal.savedAmount);
        }
        throw new ApiAccessError("心愿已被其他操作更新，请刷新后重试", 409);
      }
      return privateJson({ ok: true, duplicate: false, refundedAmount: goal.savedAmount });
    }
    const emptyResults = await db.batch([
      db.prepare("INSERT OR REPLACE INTO sync_tombstones(entity_type,entity_uuid,ledger_id,deleted_at) SELECT 'savings-goal',uuid,ledger_id,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM savings_goals WHERE id=? AND ledger_id=? AND updated_at=?").bind(id, goal.ledgerId, goal.updatedAt),
      db.prepare("DELETE FROM savings_goals WHERE id=? AND ledger_id=? AND updated_at=? AND changes()>0").bind(id, goal.ledgerId, goal.updatedAt),
    ]);
    if (!Number(emptyResults.at(-1)?.meta?.changes ?? 0))
      throw new ApiAccessError("心愿已被其他操作更新，请刷新后重试", 409);

    return privateJson({ ok: true, duplicate: false, refundedAmount: goal.savedAmount });
  } catch (error) {
    return accessErrorResponse(error, "删除失败", request);
  }
}
