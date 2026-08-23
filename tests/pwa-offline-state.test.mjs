import assert from "node:assert/strict";
import test from "node:test";
import { createOfflineSyncGate, isLocalPreviewHost, neoLedgerCacheKeys } from "../app/pwa-offline-state.ts";

test("PWA local preview detection is limited to loopback hosts", () => {
  assert.equal(isLocalPreviewHost("localhost"), true);
  assert.equal(isLocalPreviewHost("127.0.0.1"), true);
  assert.equal(isLocalPreviewHost("::1"), true);
  assert.equal(isLocalPreviewHost("ledger.example.com"), false);
});
test("development cleanup never deletes unrelated origin caches", () => {
  assert.deepEqual(neoLedgerCacheKeys(["neo-ledger-v1", "other-app", "neo-ledger-files"]), ["neo-ledger-v1", "neo-ledger-files"]);
});
test("offline sync gate rejects overlapping runs and recovers after completion", () => {
  const gate = createOfflineSyncGate();
  assert.equal(gate.begin(), true);
  assert.equal(gate.begin(), false);
  gate.end();
  assert.equal(gate.begin(), true);
});
