import assert from "node:assert/strict";
import test from "node:test";
import { accountDeleteUrl, createBillImportAccount, transferKind } from "../app/ledger-account-actions.ts";

test("account action maps debt targets to repayment transfers", () => {
  assert.equal(transferKind("负债"), "信用卡还款");
  assert.equal(transferKind("资产"), "账户转账");
  assert.equal(transferKind(undefined), "账户转账");
});

test("account deletion URL carries the loaded version", () => {
  assert.equal(
    accountDeleteUrl({ id: 7, updatedAt: "2026-08-19T10:00:00.000Z" }),
    "/api/accounts?id=7&expectedUpdatedAt=2026-08-19T10%3A00%3A00.000Z",
  );
});

test("bill import account creation keeps a zeroed cash-flow account payload", async () => {
  const calls = [];
  const request = async (input, init) => {
    calls.push({ input, init });
    return { response: new Response(null, { status: 201 }), data: { id: 23 } };
  };
  const result = await createBillImportAccount({
    ledgerId: 4,
    name: "支付宝",
    type: "资产",
    currency: "CNY",
    request,
  });
  assert.equal(result.data.id, 23);
  assert.equal(calls[0].input, "/api/accounts");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    ledgerId: 4,
    name: "支付宝",
    type: "资产",
    balance: 0,
    billDay: null,
    repaymentDay: null,
    isInvestment: false,
    currency: "CNY",
    assetClass: "现金流",
  });
});
