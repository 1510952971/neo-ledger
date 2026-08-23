import assert from "node:assert/strict";
import test from "node:test";
import { privacyLockReducer } from "../app/privacy-lock.ts";

const enabled = { enabled: true, locked: true, pin: "", error: "", pending: false };

test("privacy lock normalizes PIN and clears stale errors", () => {
  const state = privacyLockReducer({ ...enabled, error: "旧错误" }, { type: "pin", value: "1a23-45" });
  assert.equal(state.pin, "1234");
  assert.equal(state.error, "");
});

test("privacy lock configuration and unlock transitions are explicit", () => {
  const configured = privacyLockReducer({ ...enabled, enabled: false, locked: false }, { type: "configured", enabled: true });
  assert.equal(configured.locked, true);
  const unlocked = privacyLockReducer({ ...configured, pin: "1234", pending: true }, { type: "unlocked" });
  assert.deepEqual(unlocked, { enabled: true, locked: false, pin: "", error: "", pending: false });
  assert.equal(privacyLockReducer(unlocked, { type: "lock" }).locked, true);
});

test("disabled privacy lock ignores lifecycle lock events", () => {
  const disabled = { enabled: false, locked: false, pin: "", error: "", pending: false };
  assert.deepEqual(privacyLockReducer(disabled, { type: "lock" }), disabled);
  const rejected = privacyLockReducer({ ...enabled, pin: "9999", pending: true }, { type: "rejected", error: "安全码不正确" });
  assert.equal(rejected.pin, "");
  assert.equal(rejected.pending, false);
  assert.equal(rejected.error, "安全码不正确");
});
