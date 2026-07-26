import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";
import { localDateTimeToUtc } from "../../time-money.js";
import {
  normalizeTransactionEdit,
  transactionBalanceDelta,
} from "../../transaction-edit-core.js";

export const dynamic = "force-dynamic";

type ExistingTransaction = {
  id: number;
  ledgerId: number;
  amount: number;
  type: "支出" | "收入";
  accountId: number;
  incomeCategory: string | null;
  currency: string;
  originalAmount: number | null;
  originalCurrency: string | null;
  exchangeRateMicros: number;
  installmentId: number | null;
  isSideHustle: number;
  splitMode: string | null;
  splitWithMemberId: number | null;
  updatedAt: string;
  oldAccountInvestment: number;
};

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const value = normalizeTransactionEdit(await request.json());
    await claimAndRequireLedger(request, value.ledgerId);
    const db = getDbBinding();
    const current = await db
      .prepare(
        `SELECT t.id,t.ledger_id ledgerId,t.amount,t.type,t.account_id accountId,
          t.income_category incomeCategory,t.currency,t.original_amount originalAmount,
          t.original_currency originalCurrency,t.exchange_rate_micros exchangeRateMicros,
          t.installment_id installmentId,t.is_side_hustle isSideHustle,t.updated_at updatedAt,
          t.split_mode splitMode,t.split_with_member_id splitWithMemberId,
          a.is_investment oldAccountInvestment
        FROM transactions t JOIN accounts a ON a.id=t.account_id
        WHERE t.id=? AND t.ledger_id=?`,
      )
      .bind(value.id, value.ledgerId)
      .first<ExistingTransaction>();
    if (!current) throw new Error("账单不存在");
    if (current.installmentId)
      throw new Error("分期自动生成的流水不能单独修改，请前往分期项目管理");
    if (current.updatedAt !== value.expectedUpdatedAt)
      return NextResponse.json(
        { error: "这笔账单已在其他位置更新，请刷新后重试" },
        { status: 409 },
      );

    const account = await db
      .prepare(
        "SELECT id,currency,is_investment isInvestment FROM accounts WHERE id=? AND ledger_id=?",
      )
      .bind(value.accountId, value.ledgerId)
      .first<{ id: number; currency: string; isInvestment: number }>();
    if (!account) throw new Error("账户不存在或不属于当前账本");

    let expenseBuiltinKey: string | null = null;
    let incomeBuiltinKey: string | null = null;
    if (value.type === "支出") {
      const category = await db
        .prepare(
          "SELECT builtin_key builtinKey FROM expense_categories WHERE ledger_id=? AND name=? AND is_active=1",
        )
        .bind(value.ledgerId, value.category)
        .first<{ builtinKey: string | null }>();
      if (!category) throw new Error("请选择有效的消费分类");
      expenseBuiltinKey = category.builtinKey;
    } else {
      const category = await db
        .prepare(
          "SELECT builtin_key builtinKey FROM income_categories WHERE ledger_id=? AND name=? AND is_active=1",
        )
        .bind(value.ledgerId, value.incomeCategory)
        .first<{ builtinKey: string | null }>();
      if (!category) throw new Error("请选择有效的收入分类");
      incomeBuiltinKey = category.builtinKey;
    }

    const occurredAt = localDateTimeToUtc(
      value.occurredAt,
      value.originalTimezone,
    );
    const oldInvestmentIncome =
      current.type === "收入" &&
      current.incomeCategory === "理财收益" &&
      current.oldAccountInvestment
        ? current.amount
        : 0;
    const newInvestmentIncome =
      value.type === "收入" &&
      incomeBuiltinKey === "理财收益" &&
      account.isInvestment
        ? value.amount
        : 0;
    const preserveOriginal =
      current.amount === value.amount && current.currency === account.currency;
    const originalAmount = preserveOriginal
      ? (current.originalAmount ?? current.amount)
      : value.amount;
    const originalCurrency = preserveOriginal
      ? (current.originalCurrency ?? current.currency)
      : account.currency;
    const exchangeRateMicros = preserveOriginal
      ? current.exchangeRateMicros
      : 1_000_000;
    const isSideHustle =
      current.type === "收入" && value.type === "收入"
        ? current.isSideHustle
        : 0;
    const staleGuard =
      "EXISTS(SELECT 1 FROM transactions WHERE id=? AND ledger_id=? AND updated_at=?)";
    const results = await db.batch([
      db
        .prepare(
          `UPDATE accounts SET current_balance=current_balance+?,
            cumulative_income=MAX(0,cumulative_income-?),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id=? AND ledger_id=? AND ${staleGuard}`,
        )
        .bind(
          -transactionBalanceDelta(
            current.type,
            current.amount,
            current.splitMode,
            current.splitWithMemberId ?? 0,
          ),
          oldInvestmentIncome,
          current.accountId,
          value.ledgerId,
          value.id,
          value.ledgerId,
          value.expectedUpdatedAt,
        ),
      db
        .prepare(
          `UPDATE accounts SET current_balance=current_balance+?,
            cumulative_income=cumulative_income+?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id=? AND ledger_id=? AND ${staleGuard}`,
        )
        .bind(
          transactionBalanceDelta(
            value.type,
            value.amount,
            value.type === "支出" ? current.splitMode : null,
            value.type === "支出" ? (current.splitWithMemberId ?? 0) : 0,
          ),
          newInvestmentIncome,
          value.accountId,
          value.ledgerId,
          value.id,
          value.ledgerId,
          value.expectedUpdatedAt,
        ),
      value.type === "支出"
        ? db
            .prepare(
              `UPDATE side_hustle_deductions SET amount=?,note=?
              WHERE transaction_id=? AND ledger_id=? AND ${staleGuard}`,
            )
            .bind(
              value.amount,
              value.title,
              value.id,
              value.ledgerId,
              value.id,
              value.ledgerId,
              value.expectedUpdatedAt,
            )
        : db
            .prepare(
              `DELETE FROM side_hustle_deductions
              WHERE transaction_id=? AND ledger_id=? AND ${staleGuard}`,
            )
            .bind(
              value.id,
              value.ledgerId,
              value.id,
              value.ledgerId,
              value.expectedUpdatedAt,
            ),
      db
        .prepare(
          `UPDATE transactions SET title=?,amount=?,type=?,mood=?,category=?,category_dynamic=?,
            income_category=?,income_category_dynamic=?,account_id=?,currency=?,original_amount=?,
            original_currency=?,exchange_rate_micros=?,original_timezone=?,occurred_at=?,
            paid_by_member_id=CASE WHEN ?='收入' THEN NULL ELSE paid_by_member_id END,
            split_with_member_id=CASE WHEN ?='收入' THEN NULL ELSE split_with_member_id END,
            split_mode=CASE WHEN ?='收入' THEN NULL ELSE split_mode END,
            my_share_percent=CASE WHEN ?='收入' THEN 100 ELSE my_share_percent END,
            is_side_hustle=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id=? AND ledger_id=? AND updated_at=?`,
        )
        .bind(
          value.title,
          value.amount,
          value.type,
          value.mood,
          value.type === "支出" ? expenseBuiltinKey : null,
          value.category,
          value.type === "收入" ? incomeBuiltinKey : null,
          value.incomeCategory,
          value.accountId,
          account.currency,
          originalAmount,
          originalCurrency,
          exchangeRateMicros,
          value.originalTimezone,
          occurredAt,
          value.type,
          value.type,
          value.type,
          value.type,
          isSideHustle,
          value.id,
          value.ledgerId,
          value.expectedUpdatedAt,
        ),
    ]);
    if (Number(results.at(-1)?.meta.changes ?? 0) !== 1)
      return NextResponse.json(
        { error: "这笔账单已在其他位置更新，请刷新后重试" },
        { status: 409 },
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "修改失败");
  }
}
