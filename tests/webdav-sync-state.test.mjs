import assert from "node:assert/strict";
import test from "node:test";
import {
  initialWebDavSyncState,
  webDavSyncReducer,
} from "../app/webdav-sync-state.ts";

test("WebDAV sync state starts idle with no selected mode", () => {
  assert.deepEqual(initialWebDavSyncState, {
    status: "尚未同步",
    syncing: false,
    mode: null,
  });
});

test("WebDAV sync reducer marks one selected operation as running", () => {
  let state = webDavSyncReducer(initialWebDavSyncState, {
    type: "select",
    mode: "download",
  });
  state = webDavSyncReducer(state, { type: "begin", mode: "download" });
  assert.equal(state.mode, "download");
  assert.equal(state.syncing, true);
  state = webDavSyncReducer(state, { type: "status", value: "同步失败：网络超时" });
  assert.equal(state.status, "同步失败：网络超时");
  state = webDavSyncReducer(state, { type: "finish" });
  assert.equal(state.syncing, false);
  assert.equal(state.mode, "download");
});

test("WebDAV sync finish preserves the latest status", () => {
  let state = webDavSyncReducer(initialWebDavSyncState, {
    type: "begin",
    mode: "smart",
  });
  state = webDavSyncReducer(state, { type: "status", value: "刚刚完成加密上传" });
  state = webDavSyncReducer(state, { type: "finish" });
  assert.equal(state.status, "刚刚完成加密上传");
  assert.equal(state.syncing, false);
});
