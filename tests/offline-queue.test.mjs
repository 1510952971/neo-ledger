import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOfflineEntryWithinBudget,
  isOfflineEntryWithinBudget,
  MAX_OFFLINE_ENTRY_BYTES,
  MAX_OFFLINE_QUEUE_ENTRIES,
  offlineQueueHasCapacity,
} from "../app/offline-queue.ts";

test("offline queue accepts bounded ids and rejects oversized or malformed entries", () => {
  assert.equal(isOfflineEntryWithinBudget({ offlineId: "entry-1", title: "早餐" }), true);
  assert.equal(isOfflineEntryWithinBudget({ offlineId: "bad id" }), false);
  assert.equal(isOfflineEntryWithinBudget({ offlineId: "x", note: "x".repeat(MAX_OFFLINE_ENTRY_BYTES) }), false);
  assert.throws(() => assertOfflineEntryWithinBudget({ offlineId: "bad id" }), /有效编号/u);
});

test("offline queue capacity allows replacement but rejects a new entry at the hard limit", () => {
  assert.equal(offlineQueueHasCapacity(MAX_OFFLINE_QUEUE_ENTRIES, false), false);
  assert.equal(offlineQueueHasCapacity(MAX_OFFLINE_QUEUE_ENTRIES, true), true);
  assert.equal(offlineQueueHasCapacity(MAX_OFFLINE_QUEUE_ENTRIES - 1, false), true);
  assert.equal(offlineQueueHasCapacity(Number.NaN, false), false);
  assert.equal(offlineQueueHasCapacity(-1, false), false);
});
