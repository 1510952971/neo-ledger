import assert from "node:assert/strict";
import test from "node:test";
import {
  billImportBatchUrl,
  cleanBadBillImports,
  previewBillImport,
} from "../app/ledger-bill-import-actions.ts";

test("bill import batch URLs keep ledger scope and encode batch IDs", () => {
  assert.equal(billImportBatchUrl(7), "/api/bill-import?ledger=7");
  assert.equal(
    billImportBatchUrl(7, "batch with/slash"),
    "/api/bill-import?ledger=7&batchId=batch+with%2Fslash",
  );
  assert.equal(
    billImportBatchUrl(7, "batch-1", true),
    "/api/bill-import?ledger=7&batchId=batch-1&resume=1",
  );
});

test("bill import preview keeps ledger/items payload and dedicated response budget", async () => {
  const calls = [];
  const request = async (input, init, maxBytes) => {
    calls.push({ input, init, maxBytes });
    return { response: new Response(null, { status: 200 }), data: { items: [] } };
  };
  await previewBillImport({ ledgerId: 7, items: [{ title: "咖啡", amount: 12.5 }], request });
  assert.equal(calls[0].input, "/api/bill-import");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    ledgerId: 7,
    items: [{ title: "咖啡", amount: 12.5 }],
  });
  assert.equal(calls[0].maxBytes, 15 * 1024 * 1024);
});

test("bad bill import cleanup uses the scoped ledger delete endpoint", async () => {
  const calls = [];
  const request = async (input, init) => {
    calls.push({ input, init });
    return { response: new Response(null, { status: 200 }), data: { deleted: 2 } };
  };
  const result = await cleanBadBillImports({ ledgerId: 9, request });
  assert.equal(result.data.deleted, 2);
  assert.deepEqual(calls[0], {
    input: "/api/bill-import?ledger=9",
    init: { method: "DELETE" },
  });
});
