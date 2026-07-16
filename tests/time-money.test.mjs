import assert from "node:assert/strict";
import test from "node:test";
import {
  convertCurrencyCents,
  dateKeyInZone,
  localDateTimeToUtc,
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
