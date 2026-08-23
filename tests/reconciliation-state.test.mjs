import assert from "node:assert/strict";
import test from "node:test";
import { reconciliationRowsAfterUpdate } from "../app/reconciliation-state.ts";
import { loadReconciliationRows, updateReconciliation } from "../app/reconciliation-actions.ts";

test("reconciliation reads stay ledger-scoped and bounded", async () => {
  const calls = [];
  const request = async (input, init, maxBytes) => {
    calls.push({ input, init, maxBytes });
    return { response: new Response(null, { status: 200 }), data: [] };
  };
  await loadReconciliationRows({ ledgerId: 7, transactionIds: [4, 5, 0, -1, ...Array.from({ length: 110 }, (_, index) => index + 10)], request });
  assert.match(calls[0].input, /^\/api\/transactions\/reconciliation\?ledger=7&ids=4%2C5%2C10/u);
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].maxBytes, 512 * 1024);
});

test("reconciliation writes cap transaction ids and preserve status payload", async () => {
  const calls = [];
  const request = async (input, init, maxBytes) => {
    calls.push({ input, init, maxBytes });
    return { response: new Response(null, { status: 200 }), data: {} };
  };
  await updateReconciliation({ ledgerId: 3, transactionIds: [8, 9, 0], status: "exception", request });
  assert.equal(calls[0].input, "/api/transactions/reconciliation");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    ledgerId: 3,
    transactionIds: [8, 9],
    status: "exception",
  });
  assert.equal(calls[0].maxBytes, 512 * 1024);
});

test("reconciliation update changes only selected transactions", () => {
  const current = {
    1: { transactionId: 1, status: "exception", note: "核对", reconciledAt: null },
    2: { transactionId: 2, status: "unreconciled", note: null, reconciledAt: null },
  };
  const next = reconciliationRowsAfterUpdate(current, [2, 3], "reconciled", "2026-08-17T01:02:03.000Z");
  assert.deepEqual(next[1], current[1]);
  assert.equal(next[2].status, "reconciled");
  assert.equal(next[3].reconciledAt, "2026-08-17T01:02:03.000Z");
  assert.notEqual(next, current);
});

test("non-reconciled states clear the reconciliation timestamp", () => {
  const next = reconciliationRowsAfterUpdate({}, [9], "exception", "2026-08-17T01:02:03.000Z");
  assert.deepEqual(next[9], { transactionId: 9, status: "exception", note: null, reconciledAt: null });
});
