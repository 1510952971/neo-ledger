import assert from "node:assert/strict";
import test from "node:test";
import { appUpdateReducer, initialAppUpdateState } from "../app/app-update-control.ts";

const info = { currentVersion: "1.0.0", latestVersion: "1.1.0", tag: "v1.1.0", available: true, releaseName: "", notes: "", publishedAt: null, releaseUrl: "", canApply: true };

test("app update state clears stale errors when checking and applying", () => {
  let state = appUpdateReducer({ ...initialAppUpdateState, error: "旧错误" }, { type: "check-start" });
  assert.deepEqual(state, { ...initialAppUpdateState, checking: true });
  state = appUpdateReducer(state, { type: "check-success", info });
  assert.equal(state.info, info);
  state = appUpdateReducer(state, { type: "apply-start" });
  assert.equal(state.applying, true);
  assert.equal(state.checking, false);
});

test("app update failure always releases both operation locks", () => {
  const state = appUpdateReducer({ ...initialAppUpdateState, checking: true, applying: true }, { type: "failure", error: "升级失败" });
  assert.equal(state.checking, false);
  assert.equal(state.applying, false);
  assert.equal(state.error, "升级失败");
});
