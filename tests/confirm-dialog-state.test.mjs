import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmDialogReducer,
  initialConfirmDialogState,
} from "../app/confirm-dialog-state.ts";

test("confirm dialog starts closed with an empty input", () => {
  assert.deepEqual(initialConfirmDialogState(), { ask: null, value: "" });
});

test("opening a confirm dialog seeds its input and replaces stale state", () => {
  let resolved = null;
  let state = confirmDialogReducer(initialConfirmDialogState(), {
    type: "open",
    ask: { title: "删除", message: "确认吗", tone: "danger", confirmText: "删除", resolve: (value) => { resolved = value; } },
    value: "确认删除",
  });
  assert.equal(state.ask?.title, "删除");
  assert.equal(state.value, "确认删除");
  state.ask.resolve("ok");
  assert.equal(resolved, "ok");
});

test("confirm dialog value updates are functional and close clears everything", () => {
  let state = confirmDialogReducer(initialConfirmDialogState(), {
    type: "open",
    ask: { title: "输入", message: "填写", tone: "normal", confirmText: "确定", resolve: () => {} },
    value: "a",
  });
  state = confirmDialogReducer(state, { type: "value", value: (previous) => previous + "b" });
  assert.equal(state.value, "ab");
  state = confirmDialogReducer(state, { type: "close" });
  assert.deepEqual(state, { ask: null, value: "" });
});
