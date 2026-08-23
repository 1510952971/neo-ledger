import assert from "node:assert/strict";
import test from "node:test";
import { liquidateAsset, saveAsset } from "../app/asset-actions.ts";

function stub(calls, status, data = null) {
  return async (input, init) => {
    calls.push({ input: String(input), init });
    return { response: new Response(null, { status }), data };
  };
}

test("资产动作模块区分新增和编辑请求", async () => {
  const calls = [];
  const input = { ledgerId: 7, name: "相机", assetType: "数码", currency: "CNY", valuationMode: "自动折旧", manualValue: 0, purchasePrice: 5000, purchaseDate: "2026-08-19", lifespanMonths: 36, residualRate: 10, heatLevel: null };
  await saveAsset(input, stub(calls, 201));
  assert.equal(calls[0].init.method, "POST");
  await saveAsset({ ...input, id: 12, expectedUpdatedAt: "2026-08-19T00:00:00.000Z" }, stub(calls, 200));
  assert.equal(calls[1].init.method, "PUT");
  assert.equal(JSON.parse(calls[1].init.body).id, 12);
});

test("资产变现动作保留账户、价格和服务端错误", async () => {
  const calls = [];
  const result = await liquidateAsset({ id: 12, ledgerId: 7, salePrice: 100, accountId: 3, expectedUpdatedAt: "2026-08-19T00:00:00.000Z", idempotencyKey: "asset-sale-test-001" }, stub(calls, 409, { error: "资产不存在" }));
  assert.deepEqual(result, { ok: false, error: "资产不存在" });
  assert.equal(calls[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].init.body), { id: 12, ledgerId: 7, salePrice: 100, accountId: 3, expectedUpdatedAt: "2026-08-19T00:00:00.000Z", idempotencyKey: "asset-sale-test-001" });
});

test("资产变现动作默认生成可重试幂等键", async () => {
  const calls = [];
  await liquidateAsset({ id: 12, ledgerId: 7, salePrice: 100, accountId: 3, expectedUpdatedAt: "2026-08-19T00:00:00.000Z" }, stub(calls, 200, { ok: true }));
  assert.match(JSON.parse(calls[0].init.body).idempotencyKey, /^[0-9a-f-]{36}$/u);
});
