import assert from "node:assert/strict";
import test from "node:test";
import { removeCategory, restoreCategory, saveCategory } from "../app/category-actions.ts";

function requestStub(calls, ok = true, error) {
  return async (input, init) => {
    calls.push({ input: String(input), init });
    return { response: new Response(null, { status: ok ? 200 : 400 }), data: error ? { error } : null };
  };
}

test("分类动作模块统一构造新增/编辑请求", async () => {
  const calls = [];
  const result = await saveCategory({ kind: "expense", ledgerId: 7, name: "餐饮", icon: "🍔", color: "#123456" }, requestStub(calls));
  assert.equal(result.ok, true);
  assert.equal(calls[0].input, "/api/categories");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { ledgerId: 7, name: "餐饮", icon: "🍔", color: "#123456", isActive: true });
});

test("分类动作模块编码删除参数并保留服务端错误", async () => {
  const calls = [];
  const result = await removeCategory({ kind: "income", ledgerId: 7, id: 9 }, requestStub(calls, false, "分类不存在"));
  assert.deepEqual(result, { ok: false, error: "分类不存在" });
  assert.equal(calls[0].input, "/api/income-categories?id=9&ledger=7");
});

test("分类动作模块统一构造恢复请求", async () => {
  const calls = [];
  await restoreCategory({ kind: "expense", ledgerId: 7, id: 9, name: "餐饮", icon: "🍔", color: "#123456" }, requestStub(calls));
  assert.equal(calls[0].init.method, "PUT");
  assert.equal(JSON.parse(calls[0].init.body).isActive, true);
});
