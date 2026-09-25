import assert from "node:assert/strict";
import test from "node:test";
import {
  convertCurrencyCents,
  dateKeyInZone,
  localDateTimeToUtc,
  nextRecurringDate,
} from "../app/time-money.js";

test("stores local statement time as UTC while retaining deterministic date keys", () => {
  assert.equal(
    localDateTimeToUtc("2026-07-15 20:30:00", "Asia/Shanghai"),
    "2026-07-15T12:30:00.000Z",
  );
  assert.equal(
    dateKeyInZone(new Date("2026-07-15T16:30:00.000Z"), "Asia/Shanghai"),
    "2026-07-16",
  );
});

test("honors explicit offsets and rejects impossible zoned dates", () => {
  assert.equal(
    localDateTimeToUtc("2026-07-15T20:30:00+08:00", "America/New_York"),
    "2026-07-15T12:30:00.000Z",
  );
  assert.throws(
    () => localDateTimeToUtc("2026-03-08 02:30:00", "America/New_York"),
    /不存在/,
  );
  assert.throws(
    () => localDateTimeToUtc("2026-02-30 12:00:00", "Asia/Shanghai"),
    /不存在/,
  );
});

test("cross-currency conversion stores a reproducible integer rate", () => {
  assert.deepEqual(convertCurrencyCents(100_00, "USD", "CNY"), {
    convertedAmount: 720_00,
    exchangeRateMicros: 7_200_000,
  });
  assert.deepEqual(convertCurrencyCents(720_00, "CNY", "USD"), {
    convertedAmount: 100_00,
    exchangeRateMicros: 138_889,
  });
});

test("recurring dates advance by the configured cycle without timezone drift", () => {
  assert.equal(nextRecurringDate("2026-07-01", "每月"), "2026-08-01");
  assert.equal(nextRecurringDate("2026-07-01", "每季"), "2026-10-01");
  assert.equal(nextRecurringDate("2026-07-01", "每年"), "2027-07-01");
  assert.equal(nextRecurringDate("2026-07-01", "每天"), "2026-07-02");
  assert.equal(nextRecurringDate("2026-07-01", "每周"), "2026-07-08");
  assert.equal(nextRecurringDate("2026-01-31", "每月"), "2026-02-28");
  assert.equal(nextRecurringDate("2024-02-29", "每年"), "2025-02-28");
  assert.throws(() => nextRecurringDate("2026-07-01", "每两周"), /周期类型无效/);
  assert.throws(() => nextRecurringDate("2026-02-30", "每月"), /周期日期无效/);
});
