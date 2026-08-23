import assert from "node:assert/strict";
import test from "node:test";
import { parseRestoreSummary, restoreResultStorageKey } from "../app/restore-result-state.ts";

test("restore result storage uses a dedicated session key", () => {
  assert.equal(restoreResultStorageKey, "neo-restore-result");
});

test("restore result parser rejects malformed or unsafe summaries", () => {
  assert.equal(parseRestoreSummary(null), null);
  assert.equal(parseRestoreSummary("not-json"), null);
  assert.equal(parseRestoreSummary(JSON.stringify({ totalRecords: 1 })), null);
  assert.equal(parseRestoreSummary(JSON.stringify({
    totalRecords: 1,
    restoredByType: { "<script>": 1 },
    skippedRecords: 0,
    errorCount: 0,
  })), null);
});

test("restore result parser keeps valid counts", () => {
  assert.deepEqual(parseRestoreSummary(JSON.stringify({
    totalRecords: 4,
    restoredByType: { ledgers: 1, accounts: 2, transactions: 1 },
    skippedRecords: 0,
    errorCount: 0,
  })), {
    totalRecords: 4,
    restoredByType: { ledgers: 1, accounts: 2, transactions: 1 },
    skippedRecords: 0,
    errorCount: 0,
  });
});
