import assert from "node:assert/strict";
import test from "node:test";
import { subscriptionPresentation } from "../app/subscription-presentation.js";

test("subscription presentation keeps expiry urgency and daily cost stable", () => {
  const expired = subscriptionPresentation({ amount: 3000, cycle: "每月", nextChargeDate: "2026-08-10" }, "2026-08-17");
  assert.deepEqual(expired, { daysLeft: -7, expiryStatus: "已到期 7 天", dailyCost: 100, statusClass: "expired" });
  const today = subscriptionPresentation({ amount: 9100, cycle: "每季", nextChargeDate: "2026-08-17" }, "2026-08-17");
  assert.equal(today.expiryStatus, "今天到期");
  assert.equal(today.dailyCost, 100);
  assert.equal(today.statusClass, "expiring");
  const upcoming = subscriptionPresentation({ amount: 36500, cycle: "每年", nextChargeDate: "2026-08-24" }, "2026-08-17");
  assert.equal(upcoming.daysLeft, 7);
  assert.equal(upcoming.dailyCost, 100);
  assert.equal(upcoming.statusClass, "expiring");
});
