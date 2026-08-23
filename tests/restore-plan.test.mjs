import assert from "node:assert/strict";
import test from "node:test";
import { canonicalRestorePayload, fingerprintRestorePlan } from "../app/restore-plan.ts";

test("restore plan fingerprint is stable across object key order", async () => {
  const first = { version: 23, ledgers: [{ id: 1, name: "主账本" }], meta: { b: 2, a: 1 } };
  const second = { meta: { a: 1, b: 2 }, ledgers: [{ name: "主账本", id: 1 }], version: 23 };
  assert.equal(canonicalRestorePayload(first), canonicalRestorePayload(second));
  assert.equal(await fingerprintRestorePlan(first), await fingerprintRestorePlan(second));
});

test("restore plan fingerprint changes when a financial value changes", async () => {
  const original = { version: 23, transactions: [{ id: 1, amount: 100 }] };
  const changed = { version: 23, transactions: [{ id: 1, amount: 101 }] };
  assert.notEqual(await fingerprintRestorePlan(original), await fingerprintRestorePlan(changed));
});
