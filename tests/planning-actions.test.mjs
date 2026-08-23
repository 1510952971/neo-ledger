import assert from "node:assert/strict";
import test from "node:test";
import { processPendingTransaction, saveCategoryBudget, settleMember } from "../app/planning-actions.ts";

function stub(calls, status, data = null) {
  return async (input, init) => {
    calls.push({ input: String(input), init });
    return { response: new Response(null, { status }), data };
  };
}

test("待确认流水动作统一构造 PATCH 请求", async () => {
  const calls = [];
  assert.deepEqual(
    await processPendingTransaction({ id: 3, category: "餐饮", action: "confirm" }, stub(calls, 200)),
    { ok: true },
  );
  assert.equal(calls[0].input, "/api/pending-transactions");
  assert.deepEqual(JSON.parse(calls[0].init.body), { id: 3, category: "餐饮", action: "confirm" });
});

test("预算动作统一构造账本范围和金额", async () => {
  const calls = [];
  await saveCategoryBudget({ ledgerId: 7, category: "餐饮", amount: 123.45 }, stub(calls, 200));
  assert.equal(calls[0].input, "/api/category-budgets");
  assert.deepEqual(JSON.parse(calls[0].init.body), { ledgerId: 7, category: "餐饮", amount: 123.45 });
});

test("平账动作保留方向和服务端错误", async () => {
  const calls = [];
  const result = await settleMember({ ledgerId: 7, memberId: 9, amount: 100, direction: "iOwe", idempotencyKey: "settlement-test-001" }, stub(calls, 409, { error: "成员不存在" }));
  assert.deepEqual(result, { ok: false, error: "成员不存在" });
  assert.deepEqual(JSON.parse(calls[0].init.body), { ledgerId: 7, memberId: 9, amount: 100, direction: "iOwe", idempotencyKey: "settlement-test-001" });
});

test("平账动作在未显式传键时也生成可重试幂等键", async () => {
  const calls = [];
  await settleMember({ ledgerId: 7, memberId: 9, amount: 100, direction: "owesMe" }, stub(calls, 200));
  const payload = JSON.parse(calls[0].init.body);
  assert.match(payload.idempotencyKey, /^[0-9a-f-]{36}$/u);
});
