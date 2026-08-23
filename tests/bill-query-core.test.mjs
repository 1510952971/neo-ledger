import assert from "node:assert/strict";
import test from "node:test";
import { queryBills } from "../app/bill-query-core.ts";

const rows = [
  { title: "咖啡", type: "支出", category: "餐饮", incomeCategory: null, mood: "悦己", currency: "CNY", accountId: 1, amount: 4200, occurredAt: "2026-08-19T04:00:00Z" },
  { title: "工资", type: "收入", category: null, incomeCategory: "薪资发放", mood: null, currency: "CNY", accountId: 1, amount: 100000, occurredAt: "2026-08-18T04:00:00Z" },
  { title: "周末交通", type: "支出", category: "交通", incomeCategory: null, mood: "刚需", currency: "USD", accountId: 2, amount: 1000, occurredAt: "2026-08-23T04:00:00Z" },
];

const base = {
  transactions: rows,
  accounts: [{ id: 1, name: "现金" }, { id: 2, name: "美元卡" }],
  anchorKey: "2026-08-19",
  query: "",
  range: "all",
  exchangeRates: { CNY: 1, USD: 7 },
};

test("bill query preserves day filtering and converted totals", () => {
  const result = queryBills({ ...base, range: "day" });
  assert.equal(result.rows.length, 1);
  assert.equal(result.expense, 4200);
  assert.equal(result.balance, -4200);
});

test("bill query uses Monday week boundaries and account search", () => {
  const week = queryBills({ ...base, range: "week" });
  assert.equal(week.rows.length, 3);
  const searched = queryBills({ ...base, range: "all", query: "美元卡" });
  assert.deepEqual(searched.rows.map((row) => row.title), ["周末交通"]);
  assert.equal(searched.expense, 7000);
});

test("bill query custom range excludes outside dates", () => {
  const result = queryBills({ ...base, range: "custom", startDate: "2026-08-18", endDate: "2026-08-19" });
  assert.deepEqual(result.rows.map((row) => row.title), ["咖啡", "工资"]);
  assert.equal(result.income, 100000);
});
