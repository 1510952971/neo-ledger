import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateRestoreBatchStatements,
  MAX_RESTORE_BATCH_STATEMENTS,
} from "../app/restore-limits.ts";

test("restore statement estimate includes fixed and per-row work", () => {
  const estimate = estimateRestoreBatchStatements({
    ledgers: [{ id: 1 }],
    accounts: [{ id: 1 }],
    transactions: [{ id: 1 }],
    expenseCategories: [],
    incomeCategories: [],
    fireSettings: [],
    economicSettings: [],
    members: [],
  });
  assert.equal(estimate, 32 + 3 + 5 + 4 + 1 + 1 + 1);
});

test("restore statement budget rejects oversized batches before destructive work", () => {
  const rows = Array.from({ length: MAX_RESTORE_BATCH_STATEMENTS }, (_, id) => ({ id }));
  assert.ok(
    estimateRestoreBatchStatements({
      ledgers: rows,
      accounts: rows,
      transactions: rows,
      expenseCategories: rows,
      incomeCategories: rows,
      fireSettings: rows,
      economicSettings: rows,
      members: rows,
    }) > MAX_RESTORE_BATCH_STATEMENTS,
  );
});
