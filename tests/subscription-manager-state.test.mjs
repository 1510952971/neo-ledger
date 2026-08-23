import assert from "node:assert/strict";
import test from "node:test";
import {
  initialSubscriptionManagerState,
  subscriptionManagerReducer,
} from "../app/subscription-manager-state.ts";

const item = { id: 1, name: "云盘", category: "工具" };

test("subscription manager starts with safe editor and category defaults", () => {
  const state = initialSubscriptionManagerState([item]);
  assert.deepEqual(state.subscriptionList, [item]);
  assert.equal(state.subscriptionPage, 1);
  assert.equal(state.subscriptionOpen, false);
  assert.equal(state.subscriptionCategoryDraft.icon, "📦");
});

test("opening an editor atomically clears stale errors and category manager state", () => {
  let state = initialSubscriptionManagerState([item]);
  state = subscriptionManagerReducer(state, { type: "field", key: "subscriptionError", value: "保存失败" });
  state = subscriptionManagerReducer(state, { type: "field", key: "subscriptionCategoryOpen", value: true });
  state = subscriptionManagerReducer(state, { type: "field", key: "subscriptionCategoryError", value: "添加失败" });
  state = subscriptionManagerReducer(state, { type: "open", item, category: "工具" });
  assert.equal(state.subscriptionOpen, true);
  assert.equal(state.editingSubscription, item);
  assert.equal(state.subscriptionCategory, "工具");
  assert.equal(state.subscriptionError, "");
  assert.equal(state.subscriptionCategoryOpen, false);
  assert.equal(state.subscriptionCategoryError, "");
});

test("closing an editor clears transient state but keeps the list and page", () => {
  let state = initialSubscriptionManagerState([item]);
  state = subscriptionManagerReducer(state, { type: "open", item: null, category: "工具" });
  state = subscriptionManagerReducer(state, { type: "field", key: "subscriptionPage", value: 3 });
  state = subscriptionManagerReducer(state, { type: "field", key: "subscriptionCategoryError", value: "错误" });
  state = subscriptionManagerReducer(state, { type: "close" });
  assert.equal(state.subscriptionOpen, false);
  assert.equal(state.editingSubscription, null);
  assert.equal(state.subscriptionCategoryError, "");
  assert.equal(state.subscriptionPage, 3);
  assert.deepEqual(state.subscriptionList, [item]);
});
