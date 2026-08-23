import assert from "node:assert/strict";
import test from "node:test";
import { createNearbyPackageWorkflow } from "../app/nearby-package-workflow.ts";

const ok = (data = {}) => ({ response: new Response(null, { status: 200 }), data });
const failed = () => ({ response: new Response(null, { status: 503 }), data: { error: "导出失败" } });

test("nearby package workflow refuses to encrypt when snapshot export fails", async () => {
  let encrypted = false;
  await assert.rejects(
    createNearbyPackageWorkflow({
      exportSnapshot: async () => failed(),
      makePairingCode: () => "ABCD2345",
      encrypt: async () => { encrypted = true; return "cipher"; },
    }),
    /读取本地账本失败/u,
  );
  assert.equal(encrypted, false);
});

test("nearby package workflow encrypts the exported snapshot with a scoped pairing secret", async () => {
  const calls = [];
  const result = await createNearbyPackageWorkflow({
    exportSnapshot: async () => ok({ transactions: [{ id: 1 }] }),
    makePairingCode: () => "ZXCV6789",
    encrypt: async (snapshot, secret) => {
      calls.push({ snapshot, secret });
      return "ciphertext";
    },
    now: new Date("2026-08-19T12:00:00.000Z"),
  });
  assert.deepEqual(calls, [{ snapshot: { transactions: [{ id: 1 }] }, secret: "nearby:ZXCV6789" }]);
  assert.deepEqual(result, {
    pairingCode: "ZXCV6789",
    payload: "ciphertext",
    fileName: "neo-ledger-nearby-2026-08-19.e2ee.json",
  });
});

test("nearby package workflow rejects a successful response without a snapshot object", async () => {
  await assert.rejects(
    createNearbyPackageWorkflow({
    exportSnapshot: async () => ok(null),
    makePairingCode: () => "QWER2345",
    encrypt: async (snapshot) => JSON.stringify(snapshot),
    now: new Date("2026-01-02T00:00:00.000Z"),
    }),
    /读取本地账本失败/u,
  );
});
