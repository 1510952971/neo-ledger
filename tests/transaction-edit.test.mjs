import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeTransactionEdit,
  transactionBalanceDelta,
} from "../app/transaction-edit-core.js";

test("normalizes an imported transaction correction to integer cents", () => {
  assert.deepEqual(
    normalizeTransactionEdit({
      id: 18,
      ledgerId: 2,
      accountId: 7,
      amount: "12.345",
      type: "支出",
      title: "  修正后的午餐  ",
      mood: "刚需",
      category: "餐饮",
      occurredAt: "2025-07-16T12:30",
      originalTimezone: "Asia/Shanghai",
      expectedUpdatedAt: "2026-07-16T12:00:00.000Z",
    }),
    {
      id: 18,
      ledgerId: 2,
      accountId: 7,
      amount: 1235,
      type: "支出",
      title: "修正后的午餐",
      mood: "刚需",
      category: "餐饮",
      incomeCategory: null,
      occurredAt: "2025-07-16T12:30",
      originalTimezone: "Asia/Shanghai",
      expectedUpdatedAt: "2026-07-16T12:00:00.000Z",
    },
  );
});

test("reversing the old flow and applying the new flow keeps balances correct", () => {
  const oldExpense = transactionBalanceDelta("支出", 1_000);
  const correctedExpense = transactionBalanceDelta("支出", 1_500);
  assert.equal(-oldExpense, 1_000);
  assert.equal(correctedExpense, -1_500);
  assert.equal(-oldExpense + correctedExpense, -500);

  const correctedIncome = transactionBalanceDelta("收入", 1_500);
  assert.equal(-oldExpense + correctedIncome, 2_500);
});

test("rejects incomplete or invalid transaction edits", () => {
  assert.throws(
    () =>
      normalizeTransactionEdit({
        id: 1,
        ledgerId: 1,
        accountId: 1,
        amount: 10,
        type: "支出",
        title: "测试",
        mood: "刚需",
        category: "餐饮",
        occurredAt: "2025-07-16T12:30",
      }),
    /账单版本无效/,
  );
});
