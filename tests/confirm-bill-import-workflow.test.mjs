import assert from "node:assert/strict";
import test from "node:test";
import { confirmBillImportWorkflow } from "../app/confirm-bill-import-workflow.ts";

const rows = (accountId) => [{ accountId, amount: 100 }];

test("manual bill confirmation rejects unmapped rows before submitting", async () => {
  let submitted = false;
  const result = await confirmBillImportWorkflow({
    rows: [...rows(0), ...rows(2)],
    submitRows: async () => { submitted = true; return { imported: 2 }; },
    refreshLedger: async () => undefined,
  });
  assert.equal(result.kind, "unmapped");
  assert.equal(result.error, "还有 1 笔流水没有选择入账账户");
  assert.equal(submitted, false);
});

test("manual bill confirmation preserves submit failure without refreshing", async () => {
  let refreshed = false;
  const result = await confirmBillImportWorkflow({
    rows: rows(2),
    submitRows: async () => null,
    refreshLedger: async () => { refreshed = true; },
  });
  assert.equal(result.kind, "failed");
  assert.equal(refreshed, false);
});

test("manual bill confirmation refreshes only after a successful batch", async () => {
  let refreshed = 0;
  const result = await confirmBillImportWorkflow({
    rows: rows(2),
    submitRows: async () => ({ imported: 1, duplicates: 3 }),
    refreshLedger: async () => { refreshed += 1; },
  });
  assert.deepEqual(result, { kind: "imported", error: "", imported: 1, duplicates: 3 });
  assert.equal(refreshed, 1);
});
