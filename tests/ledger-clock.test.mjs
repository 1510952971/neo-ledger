import assert from "node:assert/strict";
import test from "node:test";
import { ledgerClockValue, localDateKey } from "../app/ledger-clock.ts";

test("ledger clock uses the local calendar date rather than a UTC slice", () => {
  const local = new Date(2026, 7, 17, 0, 1, 0);
  assert.equal(localDateKey(local), "2026-08-17");
  assert.deepEqual(ledgerClockValue(local.getTime()), { clockTick: local.getTime(), todayKey: "2026-08-17" });
});

test("ledger clock rolls over month and year boundaries", () => {
  assert.equal(localDateKey(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
  assert.equal(localDateKey(new Date(2027, 0, 1, 0, 0)), "2027-01-01");
});
