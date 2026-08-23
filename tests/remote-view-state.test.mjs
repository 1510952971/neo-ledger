import assert from "node:assert/strict";
import test from "node:test";
import { forecastUrl } from "../app/forecast-state.ts";
import { notificationUrls, noticesMarkedRead } from "../app/notification-center-state.ts";

test("remote view URLs remain ledger-scoped", () => {
  assert.equal(forecastUrl(7), "/api/forecast?ledger=7");
  assert.deepEqual(notificationUrls(7), { pending: "/api/pending-transactions?ledger=7&limit=100", notices: "/api/notifications?ledger=7" });
});
test("marking notices read is immutable and preserves content", () => {
  const current = [{ id: 1, title: "提醒", message: "正文", read: 0, createdAt: "now" }];
  const next = noticesMarkedRead(current);
  assert.equal(next[0].read, true);
  assert.equal(next[0].message, "正文");
  assert.notEqual(next, current);
  assert.equal(current[0].read, 0);
});
