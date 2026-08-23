import assert from "node:assert/strict";
import test from "node:test";
import { runBillImportAccountWorkflow } from "../app/bill-import-account-workflow.ts";

const ok = (data = {}) => ({ response: new Response(null, { status: 200 }), data });
const fail = (error) => ({ response: new Response(null, { status: 400 }), data: { error } });

function rows() {
  return [{ accountId: 0, accountName: "请选择账户", amount: 100 }];
}

test("account import workflow reuses an existing account and refreshes after import", async () => {
  const calls = [];
  const result = await runBillImportAccountWorkflow({
    ledgerId: 9,
    rows: rows(),
    suggestion: { name: "支付宝", type: "资产", currency: "CNY" },
    existingAccountId: 23,
    createAccount: async () => { calls.push("create"); return ok({ id: 99 }); },
    submitRows: async (mapped) => { calls.push(["submit", mapped]); return { imported: 1 }; },
    reloadAccounts: async () => { calls.push("reload"); },
  });
  assert.equal(result.kind, "imported");
  assert.equal(result.accountId, 23);
  assert.equal(result.mappedRows[0].accountName, "支付宝");
  assert.deepEqual(calls.map((item) => Array.isArray(item) ? item[0] : item), ["submit", "reload"]);
});

test("account import workflow creates a zero-state account before importing", async () => {
  const calls = [];
  const result = await runBillImportAccountWorkflow({
    ledgerId: 9,
    rows: rows(),
    suggestion: { name: "微信支付", type: "资产", currency: "CNY" },
    createAccount: async (input) => { calls.push(["create", input]); return ok({ id: 31 }); },
    submitRows: async () => { calls.push("submit"); return { imported: 2 }; },
    reloadAccounts: async () => { calls.push("reload"); },
  });
  assert.equal(result.accountId, 31);
  assert.deepEqual(calls[0], ["create", { ledgerId: 9, name: "微信支付", type: "资产", currency: "CNY" }]);
  assert.deepEqual(calls.slice(1), ["submit", "reload"]);
});

test("account import workflow keeps mapped rows and refreshes when import fails", async () => {
  let reloads = 0;
  const result = await runBillImportAccountWorkflow({
    ledgerId: 9,
    rows: rows(),
    suggestion: { name: "银行卡", type: "资产", currency: "CNY" },
    existingAccountId: 8,
    createAccount: async () => ok({ id: 99 }),
    submitRows: async () => null,
    reloadAccounts: async () => { reloads += 1; },
  });
  assert.equal(result.kind, "import-failed");
  assert.equal(result.mappedRows[0].accountId, 8);
  assert.equal(reloads, 1);
});

test("account import workflow fails closed when account creation is rejected", async () => {
  let submitted = false;
  await assert.rejects(
    runBillImportAccountWorkflow({
      ledgerId: 9,
      rows: rows(),
      suggestion: { name: "信用卡", type: "负债", currency: "CNY" },
      createAccount: async () => fail("账户已存在"),
      submitRows: async () => { submitted = true; return { imported: 1 }; },
      reloadAccounts: async () => undefined,
    }),
    /账户已存在/u,
  );
  assert.equal(submitted, false);
});
