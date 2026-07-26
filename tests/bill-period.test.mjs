import assert from "node:assert/strict";
import test from "node:test";
import {
  billPeriodLabel,
  billWeekValue,
  dateKeyFromBillWeek,
  normalizeBillAnchor,
  setBillAnchorMonth,
  setBillAnchorYear,
  shiftBillAnchor,
} from "../app/bill-period.js";

test("keeps a selected historical year while changing bill periods", () => {
  const historical = setBillAnchorYear("2026-07-16", 2024);
  assert.equal(historical, "2024-07-16");
  assert.equal(setBillAnchorMonth(historical, "2024-03"), "2024-03-16");
  assert.equal(shiftBillAnchor(historical, "week", -1), "2024-07-09");
});

test("moves across month and leap-year boundaries without invalid dates", () => {
  assert.equal(shiftBillAnchor("2024-03-31", "month", -1), "2024-02-29");
  assert.equal(shiftBillAnchor("2024-02-29", "year", 1), "2025-02-28");
  assert.equal(setBillAnchorMonth("2025-01-31", "2025-04"), "2025-04-30");
  assert.equal(setBillAnchorYear("2024-02-29", 2023), "2023-02-28");
});

test("uses ISO weeks correctly when a week crosses a year", () => {
  assert.equal(billWeekValue("2024-12-30"), "2025-W01");
  assert.equal(dateKeyFromBillWeek("2025-W01", "2025-01-01"), "2024-12-30");
  assert.equal(dateKeyFromBillWeek("2025-W53", "2025-01-01"), "2025-01-01");
  assert.equal(
    billPeriodLabel("week", "2024-12-31"),
    "2024-12-30 至 2025-01-05",
  );
});

test("falls back only when the selected bill date is invalid", () => {
  assert.equal(normalizeBillAnchor("2024-02-29", "2026-07-16"), "2024-02-29");
  assert.equal(normalizeBillAnchor("2025-02-29", "2026-07-16"), "2026-07-16");
});
