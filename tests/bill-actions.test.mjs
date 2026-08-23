import assert from "node:assert/strict";
import test from "node:test";
import { loadBillForEdit } from "../app/bill-actions.ts";

function stub(calls, status, data) {
  return async (input, init) => {
    calls.push({ input: String(input), init });
    return { response: new Response(null, { status }), data };
  };
}

test("账单动作模块构造有界查询并返回第一条流水", async () => {
  const calls = [];
  const result = await loadBillForEdit(7, 12, stub(calls, 200, { items: [{ id: 12 }] }));
  assert.deepEqual(result.item, { id: 12 });
  assert.equal(calls[0].input, "/api/transactions/query?ledger=7&id=12&limit=1");
  assert.equal(calls[0].init.cache, "no-store");
});

test("账单动作模块保留服务端读取错误", async () => {
  const result = await loadBillForEdit(7, 12, stub([], 404, { error: "账单不存在" }));
  assert.deepEqual(result, { item: null, error: "账单不存在" });
});
