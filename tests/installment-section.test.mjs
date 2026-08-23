import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installmentPresentation } from "../app/installment-presentation.js";

const sectionSource = readFileSync(new URL("../app/installment-section.tsx", import.meta.url), "utf8");

test("installment section exposes safe reversal only for unpaid plans", () => {
  assert.match(sectionSource, /onDelete/u);
  assert.match(sectionSource, /item\.paidPeriods === 0/u);
  assert.match(sectionSource, /撤销并删除/u);
});

test("installment presentation preserves totals and month arithmetic", () => {
  assert.deepEqual(
    installmentPresentation({ totalAmount: 600000, feeAmount: 12000, periods: 12, paidPeriods: 3, startMonth: "2026-06" }),
    { periods: 12, paidPeriods: 3, grandTotal: 612000, paidAmount: 153000, remainingAmount: 459000, percent: 25, endYear: 2027, endMonth: 5 },
  );
});

test("installment presentation clamps corrupted progress", () => {
  const view = installmentPresentation({ totalAmount: 10000, feeAmount: 0, periods: 0, paidPeriods: 99, startMonth: "2026-12" });
  assert.equal(view.periods, 1);
  assert.equal(view.paidPeriods, 1);
  assert.equal(view.percent, 100);
  assert.equal(view.remainingAmount, 0);
  assert.equal(view.endYear, 2026);
  assert.equal(view.endMonth, 12);
});
