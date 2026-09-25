import test from "node:test";
import assert from "node:assert/strict";
import { calculateBudgetCarryover } from "../app/category-budget-rollover.js";

test("carries only the positive remainder through completed months", () => {
  assert.equal(
    calculateBudgetCarryover({
      monthlyAmount: 10_000,
      enabled: true,
      updatedMonth: "2026-06",
      currentMonth: "2026-09",
      spendingByMonth: new Map([
        ["2026-06", 6_000],
        ["2026-07", 12_000],
        ["2026-08", 3_000],
      ]),
    }),
    9_000,
  );
});

test("does not carry when disabled, invalid, or updated this month", () => {
  const input = {
    monthlyAmount: 10_000,
    updatedMonth: "2026-09",
    currentMonth: "2026-09",
    spendingByMonth: new Map(),
  };
  assert.equal(calculateBudgetCarryover({ ...input, enabled: true }), 0);
  assert.equal(calculateBudgetCarryover({ ...input, enabled: false }), 0);
  assert.equal(
    calculateBudgetCarryover({ ...input, enabled: true, updatedMonth: "bad" }),
    0,
  );
});
