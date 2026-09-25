import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRecurringTask, nextRecurringTaskDate } from "../app/recurring-task-core.js";

test("recurring task input uses cents, rejects malformed fields, and defaults reminder", () => {
  assert.deepEqual(normalizeRecurringTask({
    ledgerId: 2,
    name: "房租",
    amount: 2800.25,
    type: "支出",
    accountId: 4,
    cycle: "每月",
    category: "住房",
    nextRunDate: "2026-09-30",
  }), {
    ledgerId: 2,
    accountId: 4,
    amount: 280025,
    name: "房租",
    type: "支出",
    cycle: "每月",
    category: "住房",
    nextRunDate: "2026-09-30",
    reminderDays: 1,
  });
  assert.throws(() => normalizeRecurringTask({ ledgerId: 1, name: "x", amount: 1, type: "支出", accountId: 1, cycle: "每两周", category: "餐饮", nextRunDate: "2026-01-01" }), /周期/u);
  assert.throws(() => normalizeRecurringTask({ ledgerId: 1, name: "x", amount: 1, type: "支出", accountId: 1, cycle: "每天", category: "餐饮", nextRunDate: "2026-02-30" }), /日期/u);
  assert.throws(() => normalizeRecurringTask({ ledgerId: 1, name: "x", amount: 1, type: "支出", accountId: 1, cycle: "每天", category: "餐饮", nextRunDate: "2026-01-01", reminderDays: 31 }), /提醒/u);
});

test("recurring task dates advance weekly and retain month-end intent", () => {
  assert.equal(nextRecurringTaskDate("2026-02-28", "每天"), "2026-03-01");
  assert.equal(nextRecurringTaskDate("2026-02-28", "每周"), "2026-03-07");
  assert.equal(nextRecurringTaskDate("2026-01-31", "每月"), "2026-02-28");
  assert.equal(nextRecurringTaskDate("2026-02-28", "每月"), "2026-03-28");
  assert.equal(nextRecurringTaskDate("2024-02-29", "每年"), "2025-02-28");
  assert.equal(nextRecurringTaskDate("2026-11-30", "每季"), "2027-02-28");
  assert.throws(() => nextRecurringTaskDate("2026-12-01", "every day"), /周期/u);
});
