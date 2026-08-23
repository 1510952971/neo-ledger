import assert from "node:assert/strict";
import test from "node:test";
import { buildFinancialInsights, laborTax } from "../app/financial-insights-core.ts";

const rates = { CNY: 1, USD: 7.2, JPY: 0.0462, EUR: 7.85 };
const baseInput = {
  transactions: [],
  deductions: [],
  exchangeRates: rates,
  fireConfig: { monthlyExpense: 100000 },
  inflationConfig: { inflationBps: 300 },
  stressEvents: { unemployment: false, crash: false, emergency: false },
  forecast: null,
  serverSummary: null,
  transactionsTruncated: false,
  todayKey: "2026-08-19",
};

test("financial insights preserve asset, liability and FIRE invariants", () => {
  const result = buildFinancialInsights({
    ...baseInput,
    assetTotal: 1_000_000,
    accountList: [
      { type: "资产", currentBalance: 800_000, initialBalance: 700_000, currency: "CNY", assetClass: "现金流", isInvestment: false },
      { type: "负债", currentBalance: -200_000, initialBalance: -250_000, currency: "CNY", assetClass: "现金流", isInvestment: false },
    ],
  });
  assert.equal(result.liabilityTotal, 200_000);
  assert.equal(result.netWorthCny, 800_000);
  assert.equal(result.fireTarget, 30_000_000);
  assert.equal(result.allocationTotal, 800_000);
  assert.equal(result.cashRatio, 100);
  assert.equal(result.debtRatio, 20);
  assert.equal(result.inflationRate, 0.03);
});

test("financial insights use server aggregates for truncated ledgers", () => {
  const result = buildFinancialInsights({
    ...baseInput,
    assetTotal: 500_000,
    transactionsTruncated: true,
    serverSummary: { dashboard: { monthIncome: 300_000, monthExpense: 100_000, sideIncome: 220_000, sideCost: 20_000 } },
    accountList: [{ type: "资产", currentBalance: 500_000, initialBalance: 500_000, currency: "CNY", assetClass: "现金流", isInvestment: false }],
  });
  assert.ok(Math.abs(result.savingRateCny - 200 / 3) < 1e-9);
  assert.equal(result.sideIncomeCny, 220_000);
  assert.equal(result.sideCostCny, 20_000);
  assert.equal(result.sideProfit, 200_000);
});

test("stress insights and labor tax remain bounded", () => {
  assert.equal(laborTax(80000), 0);
  assert.equal(laborTax(100000), 4000);
  const result = buildFinancialInsights({
    ...baseInput,
    assetTotal: 10_000_000,
    stressEvents: { unemployment: true, crash: true, emergency: true },
    forecast: { hasSpendingData: true, averageDailySpend: 10_000, monthlyFixed: 30_000 },
    accountList: [
      { type: "资产", currentBalance: 10_000_000, initialBalance: 10_000_000, currency: "CNY", assetClass: "风险进攻", isInvestment: true },
      { type: "资产", currentBalance: 1_000_000, initialBalance: 1_000_000, currency: "CNY", assetClass: "现金流", isInvestment: false },
    ],
  });
  assert.equal(result.emergencyLoss, 3_000_000);
  assert.equal(result.marketLoss, 5_000_000);
  assert.ok(result.stressedNet >= 0);
  assert.ok(result.resilienceScore >= 0 && result.resilienceScore <= 100);
});
