import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptSyncPayload,
  encryptSyncPayload,
} from "../app/sync-crypto.js";

test("sync encryption round-trips a ledger snapshot", async () => {
  const snapshot = {
    version: 2,
    exportedAt: "2026-07-19T10:00:00.000Z",
    data: { transactions: [{ id: 1, title: "同步测试", amount: 12.34 }] },
  };
  const payload = await encryptSyncPayload(snapshot, "nearby:A1B2C3D4");

  assert.deepEqual(
    await decryptSyncPayload(payload, "nearby:A1B2C3D4"),
    snapshot,
  );
});

test("sync encryption rejects the wrong secret", async () => {
  const payload = await encryptSyncPayload({ ok: true }, "correct-secret");

  await assert.rejects(decryptSyncPayload(payload, "wrong-secret"));
});

test("sync encryption rejects modified ciphertext", async () => {
  const payload = JSON.parse(
    await encryptSyncPayload({ ok: true }, "tamper-secret"),
  );
  const last = payload.ciphertext.at(-1);
  payload.ciphertext = `${payload.ciphertext.slice(0, -1)}${last === "A" ? "B" : "A"}`;

  await assert.rejects(
    decryptSyncPayload(JSON.stringify(payload), "tamper-secret"),
  );
});
