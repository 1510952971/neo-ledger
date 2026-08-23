import assert from "node:assert/strict";
import test from "node:test";
import { categoryBudgetPresentation } from "../app/category-budget-presentation.js";

test("category budget presentation distinguishes unset and safe budgets", () => {
  assert.deepEqual(categoryBudgetPresentation(5000, 0), {
    ratio: 0,
    percentage: null,
    progress: 0,
    level: "safe",
  });
  assert.equal(categoryBudgetPresentation(7999, 10000).level, "safe");
});

test("category budget presentation warns at eighty percent and caps progress", () => {
  const warning = categoryBudgetPresentation(8000, 10000);
  assert.equal(warning.level, "warning");
  assert.equal(warning.percentage, 80);
  const exceeded = categoryBudgetPresentation(12500, 10000);
  assert.equal(exceeded.level, "danger");
  assert.equal(exceeded.percentage, 125);
  assert.equal(exceeded.progress, 100);
});

test("category budget presentation contains malformed numeric input", () => {
  assert.deepEqual(categoryBudgetPresentation(Number.NaN, Number.POSITIVE_INFINITY), {
    ratio: 0,
    percentage: null,
    progress: 0,
    level: "safe",
  });
});
