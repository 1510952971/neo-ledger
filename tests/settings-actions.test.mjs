import assert from "node:assert/strict";
import test from "node:test";
import { saveFireSettings, saveInflationSettings, saveTheme } from "../app/settings-actions.ts";

function stub(calls, status, data = null) {
  return async (input, init) => {
    calls.push({ input: String(input), init });
    return { response: new Response(null, { status }), data };
  };
}

test("设置动作统一构造通胀请求", async () => {
  const calls = [];
  await saveInflationSettings({ ledgerId: 7, inflationRate: 2.5 }, stub(calls, 200));
  assert.equal(calls[0].input, "/api/economic-settings");
  assert.deepEqual(JSON.parse(calls[0].init.body), { ledgerId: 7, inflationRate: 2.5 });
});

test("设置动作统一构造 FIRE 请求", async () => {
  const calls = [];
  await saveFireSettings({ ledgerId: 7, monthlyExpense: 8000, annualReturn: 5 }, stub(calls, 200));
  assert.equal(calls[0].input, "/api/fire-settings");
  assert.deepEqual(JSON.parse(calls[0].init.body), { ledgerId: 7, monthlyExpense: 8000, annualReturn: 5 });
});

test("主题动作保留服务端错误", async () => {
  const calls = [];
  const result = await saveTheme("obsidian", stub(calls, 400, { error: "主题无效" }));
  assert.deepEqual(result, { ok: false, error: "主题无效" });
  assert.equal(calls[0].init.method, "PATCH");
});
