import assert from "node:assert/strict";
import test from "node:test";
import {
  contributeSavingsGoal,
  createSavingsGoal,
  deleteSavingsGoal,
} from "../app/savings-goal-actions.ts";

function requestStub(data = {}) {
  const calls = [];
  const request = async (input, init) => {
    calls.push({ input, init });
    return { response: new Response(null, { status: 200 }), data };
  };
  request.calls = calls;
  return request;
}

test("savings goal creation keeps ledger scope and target fields", async () => {
  const request = requestStub();
  await createSavingsGoal({
    ledgerId: 5,
    name: "旅行基金",
    targetAmount: 12000,
    deadline: "2026-12-31",
    icon: "✈️",
    request,
  });
  assert.equal(request.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(request.calls[0].init.body), {
    ledgerId: 5,
    name: "旅行基金",
    targetAmount: 12000,
    deadline: "2026-12-31",
    icon: "✈️",
  });
});

test("savings goal contribution binds goal and account", async () => {
  const request = requestStub({ appliedAmount: 3000, completed: false });
  await contributeSavingsGoal({ id: 12, accountId: 4, amount: 3000, idempotencyKey: "goal-contribution-001", request });
  assert.equal(request.calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(request.calls[0].init.body), {
    id: 12,
    accountId: 4,
    amount: 3000,
    idempotencyKey: "goal-contribution-001",
  });
});

test("savings goal contribution generates a retryable key by default", async () => {
  const request = requestStub({ appliedAmount: 3000, completed: false });
  await contributeSavingsGoal({ id: 12, accountId: 4, amount: 3000, request });
  assert.match(JSON.parse(request.calls[0].init.body).idempotencyKey, /^[0-9a-f-]{36}$/u);
});

test("savings goal deletion preserves refund account selection and version", async () => {
  const request = requestStub({ refundedAmount: 3000 });
  await deleteSavingsGoal({ id: 12, accountId: 4, expectedUpdatedAt: "2026-08-19T10:00:00.000Z", request });
  assert.equal(request.calls[0].init.method, "DELETE");
  const body = JSON.parse(request.calls[0].init.body);
  assert.deepEqual({ id: body.id, accountId: body.accountId, expectedUpdatedAt: body.expectedUpdatedAt }, { id: 12, accountId: 4, expectedUpdatedAt: "2026-08-19T10:00:00.000Z" });
  assert.match(body.idempotencyKey, /^[0-9a-f-]{36}$/u);
});
