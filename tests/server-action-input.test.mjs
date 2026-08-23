import assert from "node:assert/strict";
import test from "node:test";
import {
  actionMoneyCents,
  actionOptionalPositiveInteger,
  actionPercent,
  actionPositiveInteger,
  actionTimezone,
  boundedActionText,
} from "../app/server-action-input.ts";

test("server action input rejects unsafe identifiers and financial values", () => {
  assert.equal(actionPositiveInteger("12", "账本"), 12);
  assert.equal(actionOptionalPositiveInteger("", "账户"), 0);
  assert.throws(() => actionPositiveInteger("1.5", "账本"), /正整数/u);
  assert.equal(actionMoneyCents("12.34"), 1234);
  assert.throws(() => actionMoneyCents("NaN"), /金额/u);
  assert.throws(() => actionMoneyCents("1000000001"), /不超过/u);
  assert.equal(actionPercent("40"), 40);
  assert.throws(() => actionPercent(101), /0—100/u);
});

test("server action text and timezone boundaries are explicit", () => {
  assert.equal(boundedActionText("  咖啡  ", 10, "标题"), "咖啡");
  assert.throws(() => boundedActionText("x".repeat(11), 10, "标题"), /最多/u);
  assert.equal(actionTimezone("Asia/Shanghai"), "Asia/Shanghai");
  assert.throws(() => actionTimezone("Not/A/Timezone"), /IANA/u);
});
