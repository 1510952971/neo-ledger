import assert from "node:assert/strict";
import test from "node:test";
import { createLedger, deleteLedger, ledgerDeleteUrl } from "../app/ledger-actions.ts";

function stub(calls, response, data) {
  return async (input, init) => {
    calls.push({ input: String(input), init });
    return { response: new Response(null, { status: response }), data };
  };
}

test("账本动作模块统一构造创建请求并返回编号", async () => {
  const calls = [];
  const result = await createLedger({ name: "旅行", icon: "✈️" }, stub(calls, 201, { id: 12 }));
  assert.deepEqual(result, { ok: true, id: 12 });
  assert.equal(calls[0].input, "/api/ledgers");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { name: "旅行", icon: "✈️" });
});

test("账本动作模块编码删除编号并保留错误", async () => {
  const calls = [];
  const result = await deleteLedger(12, "2026-08-19T10:00:00.000Z", stub(calls, 409, { error: "至少需要保留一个账本" }));
  assert.deepEqual(result, { ok: false, error: "至少需要保留一个账本" });
  assert.equal(calls[0].input, "/api/ledgers?id=12&expectedUpdatedAt=2026-08-19T10%3A00%3A00.000Z");
});

test("账本删除 URL carries the loaded version", () => {
  assert.equal(ledgerDeleteUrl(12, "2026-08-19T10:00:00.000Z"), "/api/ledgers?id=12&expectedUpdatedAt=2026-08-19T10%3A00%3A00.000Z");
});
