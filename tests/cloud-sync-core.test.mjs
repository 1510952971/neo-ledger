import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCloudSyncInterval,
  shouldRunCloudSync,
} from "../app/cloud-sync-core.js";

const ready = {
  enabled: true,
  online: true,
  url: "https://dav.example.com/ledger",
  password: "app-password",
  secret: "local-secret",
  intervalMinutes: 5,
  now: 600_000,
};

test("automatic cloud sync only runs when due and fully configured", () => {
  assert.equal(shouldRunCloudSync({ ...ready, lastSyncAt: 0 }), true);
  assert.equal(shouldRunCloudSync({ ...ready, lastSyncAt: 590_000 }), false);
  assert.equal(shouldRunCloudSync({ ...ready, enabled: false }), false);
  assert.equal(shouldRunCloudSync({ ...ready, online: false }), false);
  assert.equal(shouldRunCloudSync({ ...ready, secret: "short" }), false);
});

test("cloud sync interval is constrained to supported values", () => {
  assert.equal(normalizeCloudSyncInterval(15), 15);
  assert.equal(normalizeCloudSyncInterval(7), 5);
});
