import assert from "node:assert/strict";
import test from "node:test";
import {
  initialTransactionEntryState,
  transactionEntryReducer,
} from "../app/transaction-entry-state.ts";

const initial = () => initialTransactionEntryState({
  category: "餐饮",
  incomeCategory: "薪资发放",
  accountId: 7,
  mood: "刚需",
});

test("transaction entry state starts with safe split and import defaults", () => {
  const state = initial();
  assert.equal(state.entryType, "支出");
  assert.equal(state.accountId, 7);
  assert.equal(state.splitMode, "全额由我支付");
  assert.equal(state.splitMemberId, 0);
  assert.equal(state.mySharePercent, 50);
  assert.equal(state.parsedPreview, null);
});

test("transaction entry reset actions clear independent transient flows", () => {
  let state = initial();
  state = transactionEntryReducer(state, { type: "field", key: "splitMemberId", value: 12 });
  state = transactionEntryReducer(state, { type: "field", key: "mySharePercent", value: 35 });
  state = transactionEntryReducer(state, { type: "field", key: "importText", value: "支付宝账单" });
  state = transactionEntryReducer(state, { type: "field", key: "parsedPreview", value: { amount: "35", title: "汉堡" } });
  state = transactionEntryReducer(state, { type: "reset-split" });
  assert.equal(state.splitMemberId, 0);
  assert.equal(state.mySharePercent, 50);
  assert.equal(state.importText, "支付宝账单");
  state = transactionEntryReducer(state, { type: "reset-import" });
  assert.equal(state.importText, "");
  assert.equal(state.parsedPreview, null);
});

test("transaction entry field updates support functional state transitions", () => {
  let state = initial();
  state = transactionEntryReducer(state, {
    type: "field",
    key: "mySharePercent",
    value: (previous) => previous + 10,
  });
  assert.equal(state.mySharePercent, 60);
});
