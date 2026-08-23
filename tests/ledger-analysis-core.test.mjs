import assert from "node:assert/strict";
import test from "node:test";
import { buildLedgerAnalysis, buildPeriodReports } from "../app/ledger-analysis-core.ts";

const moods = ["悦己", "刚需", "冲动"];
const rates = { CNY: 1, USD: 7 };
const transactions = [
  { amount: 1000, type: "支出", currency: "CNY", occurredAt: "2026-08-19T02:00:00Z", category: "餐饮", incomeCategory: null, mood: "刚需" },
  { amount: 100, type: "收入", currency: "USD", occurredAt: "2026-08-19T03:00:00Z", category: null, incomeCategory: "理财收益", mood: null },
  { amount: 200, type: "支出", currency: "CNY", occurredAt: "2026-08-18T03:00:00Z", category: "交通", incomeCategory: null, mood: "冲动" },
];

test("analysis core filters periods and converts currencies deterministically", () => {
  const result = buildLedgerAnalysis({
    transactions,
    dimension: "日",
    todayKey: "2026-08-19",
    exchangeRates: rates,
    categoryNames: ["餐饮", "交通"],
    incomeCategoryNames: ["理财收益"],
    moods,
  });
  assert.equal(result.filtered.length, 2);
  assert.equal(result.expenseTotal, 1000);
  assert.equal(result.incomeTotal, 700);
  assert.equal(result.balance, -300);
  assert.equal(result.topCategory?.name, "餐饮");
  assert.equal(result.investmentIncome, 700);
});

test("period reports switch night anchor exactly at local 05:00", () => {
  const beforeFive = new Date(2026, 7, 19, 4, 59, 0).getTime();
  const afterFive = new Date(2026, 7, 19, 5, 0, 0).getTime();
  const before = buildPeriodReports({ transactions, todayKey: "2026-08-19", exchangeRates: rates, nowMs: beforeFive });
  const after = buildPeriodReports({ transactions, todayKey: "2026-08-19", exchangeRates: rates, nowMs: afterFive });
  assert.equal(before?.nightDateKey, "2026-08-18");
  assert.equal(after?.nightDateKey, "2026-08-19");
  assert.notEqual(before?.nightDaily.count, after?.nightDaily.count);
});
