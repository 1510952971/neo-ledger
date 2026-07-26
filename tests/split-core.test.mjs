import test from "node:test";
import assert from "node:assert/strict";
import {
  isSplitMode,
  splitBalanceDelta,
  transactionAccountDelta,
} from "../app/split-core.js";

test("普通收支按金额改变账户余额", () => {
  assert.equal(transactionAccountDelta("支出", 1_200), -1_200);
  assert.equal(transactionAccountDelta("收入", 1_200), 1_200);
});

test("对方全额支付时不改变我的账户余额", () => {
  assert.equal(
    transactionAccountDelta("支出", 1_200, "全额由对方支付", 8),
    0,
  );
  assert.equal(
    transactionAccountDelta("支出", 1_200, "全额由对方支付", 0),
    -1_200,
  );
});

test("分账往来余额与平账方向互相抵消", () => {
  assert.equal(splitBalanceDelta(1_000, "全额由我支付", 0), 1_000);
  assert.equal(splitBalanceDelta(1_000, "人情平账", 0), -1_000);
  assert.equal(splitBalanceDelta(1_000, "全额由对方支付", 100), -1_000);
  assert.equal(splitBalanceDelta(1_000, "人情平账", 100), 1_000);
  assert.equal(splitBalanceDelta(1_000, "按比例平摊", 40), 600);
});

test("只接受已定义的分账模式", () => {
  assert.equal(isSplitMode("按比例平摊"), true);
  assert.equal(isSplitMode("随便记账"), false);
});
