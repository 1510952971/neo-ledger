import assert from "node:assert/strict";
import test from "node:test";
import { accountManagerReducer, accountPayloadFromForm, initialAccountManagerState } from "../app/account-manager-state.ts";

test("opening account editor atomically selects edit mode and clears editor error", () => {
  const account = { id: 7, type: "负债", name: "信用卡" };
  const current = { ...initialAccountManagerState(), editorError: "旧错误", transferError: "转账错误" };
  const next = accountManagerReducer(current, { type: "open", account, accountType: account.type });
  assert.equal(next.open, true);
  assert.equal(next.editing, account);
  assert.equal(next.accountType, "负债");
  assert.equal(next.editorError, "");
  assert.equal(next.transferError, "转账错误");
});

test("account editor and transfer failures remain isolated", () => {
  let state = initialAccountManagerState();
  state = accountManagerReducer(state, { type: "editor-error", value: "保存失败" });
  state = accountManagerReducer(state, { type: "transfer-error", value: "余额不足" });
  assert.equal(state.editorError, "保存失败");
  assert.equal(state.transferError, "余额不足");
  state = accountManagerReducer(state, { type: "account-type", value: "负债" });
  assert.equal(state.editorError, "");
  assert.equal(state.transferError, "余额不足");
});

test("account payload removes fields that contradict the selected account type", () => {
  const form = new FormData();
  Object.entries({ name: "信用卡", balance: "1200.50", billDay: "8", repaymentDay: "18", isInvestment: "on", currency: "CNY", assetClass: "风险进攻" })
    .forEach(([key, value]) => form.set(key, value));
  const debt = accountPayloadFromForm({ ledgerId: 3, id: 7, accountType: "负债", formData: form });
  assert.equal(debt.billDay, 8);
  assert.equal(debt.repaymentDay, 18);
  assert.equal(debt.isInvestment, false);
  const asset = accountPayloadFromForm({ ledgerId: 3, accountType: "资产", formData: form });
  assert.equal(asset.billDay, null);
  assert.equal(asset.repaymentDay, null);
  assert.equal(asset.isInvestment, true);
});

test("account edit payload carries the loaded version for optimistic concurrency", () => {
  const form = new FormData();
  form.set("name", "现金");
  form.set("balance", "100");
  const payload = accountPayloadFromForm({
    ledgerId: 3,
    id: 7,
    expectedUpdatedAt: "2026-08-19T10:00:00.000Z",
    accountType: "资产",
    formData: form,
  });
  assert.equal(payload.expectedUpdatedAt, "2026-08-19T10:00:00.000Z");
});

test("account manager keeps account collection and transfer dialog state together", () => {
  const accounts = [{ id: 1, type: "资产", name: "现金" }];
  let state = initialAccountManagerState({ accounts });
  assert.deepEqual(state.accounts, accounts);
  assert.equal(state.transferOpen, false);
  state = accountManagerReducer(state, { type: "field", key: "transferOpen", value: true });
  state = accountManagerReducer(state, {
    type: "field",
    key: "accounts",
    value: (previous) => [...previous, { id: 2, type: "负债", name: "信用卡" }],
  });
  assert.equal(state.transferOpen, true);
  assert.equal(state.accounts.length, 2);
});
