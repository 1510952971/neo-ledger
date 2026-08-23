import assert from "node:assert/strict";
import test from "node:test";
import {
  createInstallment,
  removeInstallment,
  removeSubscription,
  saveSubscription,
} from "../app/recurring-actions.ts";

function requestStub(data = {}) {
  const calls = [];
  const request = async (input, init) => {
    calls.push({ input, init });
    return { response: new Response(null, { status: 200 }), data };
  };
  request.calls = calls;
  return request;
}

test("subscription save switches method by edit state and preserves payload", async () => {
  const create = requestStub();
  await saveSubscription({
    ledgerId: 3,
    name: "云盘",
    amount: 12.5,
    accountId: 8,
    cycle: "每月",
    category: "工具",
    nextChargeDate: "2026-09-01",
    request: create,
  });
  assert.equal(create.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(create.calls[0].init.body), {
    ledgerId: 3,
    name: "云盘",
    amount: 12.5,
    accountId: 8,
    cycle: "每月",
    category: "工具",
    nextChargeDate: "2026-09-01",
  });

  const edit = requestStub();
  await saveSubscription({
    id: 11,
    ledgerId: 3,
    name: "云盘 Pro",
    amount: 19.9,
    accountId: 8,
    cycle: "每月",
    category: "工具",
    nextChargeDate: "2026-09-01",
    request: edit,
  });
  assert.equal(edit.calls[0].init.method, "PUT");
  assert.equal(JSON.parse(edit.calls[0].init.body).id, 11);
});

test("subscription removal scopes both resource and ledger", async () => {
  const request = requestStub({ deleted: true });
  await removeSubscription({ id: 11, ledgerId: 3, request });
  assert.deepEqual(request.calls[0], {
    input: "/api/subscriptions?id=11&ledger=3",
    init: { method: "DELETE" },
  });
});

test("installment creation sends normalized numeric fields", async () => {
  const request = requestStub();
  await createInstallment({
    ledgerId: 3,
    name: "手机分期",
    totalAmount: 6000,
    periods: 12,
    feeAmount: 120,
    accountId: 8,
    paymentAccountId: 9,
    startMonth: "2026-09",
    chargeDay: 15,
    request,
  });
  assert.equal(request.calls[0].input, "/api/installments");
  assert.equal(request.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(request.calls[0].init.body), {
    ledgerId: 3,
    name: "手机分期",
    totalAmount: 6000,
    periods: 12,
    feeAmount: 120,
    accountId: 8,
    paymentAccountId: 9,
    startMonth: "2026-09",
    chargeDay: 15,
    idempotencyKey: JSON.parse(request.calls[0].init.body).idempotencyKey,
  });
  assert.match(JSON.parse(request.calls[0].init.body).idempotencyKey, /^[0-9a-f-]{36}$/u);
});

test("installment removal carries a retryable reversal key", async () => {
  const request = requestStub({ ok: true });
  await removeInstallment({ id: 12, expectedUpdatedAt: "2026-08-19T00:00:00.000Z", idempotencyKey: "installment-reversal-001", request });
  assert.deepEqual(request.calls[0], {
    input: "/api/installments?id=12&expectedUpdatedAt=2026-08-19T00%3A00%3A00.000Z&idempotencyKey=installment-reversal-001",
    init: { method: "DELETE" },
  });
});
