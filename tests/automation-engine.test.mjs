import test from "node:test";
import assert from "node:assert/strict";
import { matchAutomationRule } from "../app/automation-engine.ts";

test("automation rules use priority order and return an explanation", () => {
  const match = matchAutomationRule(
    { rawText: "微信支付 美好咖啡", title: "美好咖啡", amount: 2800, accountId: 3 },
    [
      { id: "first", name: "咖啡", conditions: { merchantContains: "咖啡", minAmount: 2000 }, actions: { category: "餐饮", mood: "悦己" } },
      { id: "second", name: "微信", conditions: { source: "微信" }, actions: { category: "其它" } },
    ],
  );
  assert.equal(match?.ruleId, "first");
  assert.deepEqual(match?.actions, { category: "餐饮", mood: "悦己" });
  assert.equal(match?.reasons.length, 2);
});

test("automation rules reject partial matches", () => {
  const match = matchAutomationRule(
    { rawText: "支付宝", title: "早餐", amount: 1200, accountId: 1 },
    [{ id: "rule", name: "大额早餐", conditions: { merchantContains: "早餐", minAmount: 2000 }, actions: { category: "餐饮" } }],
  );
  assert.equal(match, null);
});
