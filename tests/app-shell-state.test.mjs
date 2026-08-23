import assert from "node:assert/strict";
import test from "node:test";
import {
  appShellReducer,
  initialAppShellState,
} from "../app/app-shell-state.ts";

const initial = () => initialAppShellState("cream", null);

test("app shell starts with a safe dashboard and closed dialogs", () => {
  const state = initial();
  assert.equal(state.tab, "dashboard");
  assert.equal(state.currentAuthUser, null);
  assert.equal(state.sidebarCollapsed, false);
  assert.equal(state.dataOpen, false);
  assert.equal(state.toast, null);
});

test("app shell keeps dialog updates isolated and supports functional setters", () => {
  let state = initial();
  state = appShellReducer(state, { type: "dialog", key: "dataOpen", value: true });
  state = appShellReducer(state, { type: "dialog", key: "authOpen", value: true });
  state = appShellReducer(state, { type: "sidebar", value: (previous) => !previous });
  state = appShellReducer(state, { type: "tab", value: "analytics" });
  assert.equal(state.dataOpen, true);
  assert.equal(state.authOpen, true);
  assert.equal(state.noticeOpen, false);
  assert.equal(state.sidebarCollapsed, true);
  assert.equal(state.tab, "analytics");
});

test("app shell theme, toast, achievement and chart lifecycle remain explicit", () => {
  let state = initial();
  state = appShellReducer(state, { type: "theme", value: "obsidian" });
  state = appShellReducer(state, { type: "toast", value: { kind: "success", message: "已保存" } });
  state = appShellReducer(state, { type: "badge-focus", value: "first_entry" });
  state = appShellReducer(state, { type: "chart-ready", value: true });
  assert.equal(state.theme, "obsidian");
  assert.deepEqual(state.toast, { kind: "success", message: "已保存" });
  assert.equal(state.badgeFocusCode, "first_entry");
  assert.equal(state.chartReady, true);
});
