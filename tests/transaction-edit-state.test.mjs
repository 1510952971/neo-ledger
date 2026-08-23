import assert from "node:assert/strict";
import test from "node:test";
import {
  initialTransactionEditState,
  transactionEditReducer,
} from "../app/transaction-edit-state.ts";

const draft = { id: 12, type: "支出", accountId: 3, category: "餐饮" };

test("transaction edit starts closed with no stale error", () => {
  assert.deepEqual(initialTransactionEditState(), { open: false, draft: null, error: "" });
});

test("opening a transaction editor replaces the draft and clears old errors", () => {
  let state = initialTransactionEditState();
  state = transactionEditReducer(state, { type: "field", key: "error", value: "冲突" });
  state = transactionEditReducer(state, { type: "open", draft });
  assert.equal(state.open, true);
  assert.deepEqual(state.draft, draft);
  assert.equal(state.error, "");
});

test("transaction edit draft supports functional field updates and atomic close", () => {
  let state = transactionEditReducer(initialTransactionEditState(), { type: "open", draft });
  state = transactionEditReducer(state, {
    type: "field",
    key: "draft",
    value: (previous) => previous ? { ...previous, accountId: 9 } : previous,
  });
  assert.equal(state.draft?.accountId, 9);
  state = transactionEditReducer(state, { type: "close" });
  assert.deepEqual(state, { open: false, draft: null, error: "" });
});
