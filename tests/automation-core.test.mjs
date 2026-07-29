import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanAutomationText,
  inferAutomationCategory,
  parseAutomationText,
} from "../app/automation-core.js";

test("parses payment notifications into stable bookkeeping fields", () => {
  const parsed = parseAutomationText("微信支付 向 星巴克 付款 ¥35.50");
  assert.equal(parsed.amount, 3550);
  assert.equal(parsed.type, "支出");
  assert.equal(parsed.source, "微信");
  assert.match(parsed.merchant, /星巴克/);
  assert.equal(inferAutomationCategory(parsed.merchant), "咖啡");
});

test("parses income notifications and strips invisible whitespace", () => {
  assert.equal(cleanAutomationText(" 到账\u200b  200.00 元 "), "到账 200.00 元");
  const parsed = parseAutomationText("支付宝到账 200.00 元，付款方：测试用户");
  assert.equal(parsed.amount, 20000);
  assert.equal(parsed.type, "收入");
  assert.equal(parsed.source, "支付宝");
});
