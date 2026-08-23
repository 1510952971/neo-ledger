import assert from "node:assert/strict";
import test from "node:test";
import { exportLedgerSnapshot } from "../app/snapshot-actions.ts";

test("ledger snapshot export keeps no-store and a finite 50MB response budget", async () => {
  const calls = [];
  const request = async (input, init, maxBytes) => {
    calls.push({ input, init, maxBytes });
    return { response: new Response(null, { status: 200 }), data: { version: 30 } };
  };
  const result = await exportLedgerSnapshot(request);
  assert.equal(result.data.version, 30);
  assert.deepEqual(calls[0], {
    input: "/api/data/export?format=json",
    init: { cache: "no-store" },
    maxBytes: 50 * 1024 * 1024,
  });
});
