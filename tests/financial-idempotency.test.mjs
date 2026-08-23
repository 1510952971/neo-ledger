import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("普通转账将幂等键绑定到数据库唯一 occurrence_key", () => {
  const source = readFileSync(new URL("../app/api/transfers/route.ts", import.meta.url), "utf8");
  assert.match(source, /body\.idempotencyKey/u);
  assert.match(source, /manual:\$\{ownerId\}:transfer:/u);
  assert.match(source, /occurrence_key=\?/u);
  assert.match(source, /duplicate: true/u);
  assert.match(source, /occurrenceKey/u);
});

test("人情平账将同一个幂等键写入转账和流水", () => {
  const source = readFileSync(new URL("../app/api/settlements/route.ts", import.meta.url), "utf8");
  assert.match(source, /body\.idempotencyKey/u);
  assert.match(source, /manual:\$\{ownerId\}:settlement:/u);
  assert.match(source, /occurrence_key/u);
  assert.match(source, /occurrenceKey/u);
  assert.match(source, /duplicate: true/u);
});

test("前端资金动作会携带可重试幂等键", () => {
  const accountSource = readFileSync(new URL("../app/ledger-account-actions.ts", import.meta.url), "utf8");
  const planningSource = readFileSync(new URL("../app/planning-actions.ts", import.meta.url), "utf8");
  assert.match(accountSource, /createClientId\(\)/u);
  assert.match(accountSource, /idempotencyKey/u);
  assert.match(planningSource, /createClientId\(\)/u);
  assert.match(planningSource, /idempotencyKey: input\.idempotencyKey/u);
});

test("储蓄目标存入复用转账唯一键并处理并发冲突", () => {
  const source = readFileSync(new URL("../app/api/savings-goals/route.ts", import.meta.url), "utf8");
  assert.match(source, /goal-contribution:/u);
  assert.match(source, /occurrenceKey/u);
  assert.match(source, /duplicateContributionResponse/u);
  assert.match(source, /unique\|constraint/u);
});

test("储蓄目标退款在删除后仍可安全重试", () => {
  const source = readFileSync(new URL("../app/api/savings-goals/route.ts", import.meta.url), "utf8");
  assert.match(source, /goal-refund:/u);
  assert.match(source, /JOIN ledgers l/u);
  assert.match(source, /duplicateRefundResponse/u);
  assert.match(source, /kind='储蓄退款'/u);
});

test("分期创建将幂等键绑定到建立分期转账", () => {
  const source = readFileSync(new URL("../app/api/installments/route.ts", import.meta.url), "utf8");
  const action = readFileSync(new URL("../app/recurring-actions.ts", import.meta.url), "utf8");
  assert.match(source, /manual:\$\{ownerId\}:installment:/u);
  assert.match(source, /occurrence_key/u);
  assert.match(source, /duplicateInstallmentResponse/u);
  assert.match(action, /paymentAccountId/u);
  assert.match(action, /createClientId\(\)/u);
});

test("资产变现把回款流水绑定到幂等键", () => {
  const source = readFileSync(new URL("../app/api/assets/route.ts", import.meta.url), "utf8");
  const action = readFileSync(new URL("../app/asset-actions.ts", import.meta.url), "utf8");
  assert.match(source, /asset-liquidation:/u);
  assert.match(source, /occurrence_key/u);
  assert.match(source, /duplicateLiquidationResponse/u);
  assert.match(action, /createClientId\(\)/u);
});

test("分期撤销回款在删除后仍可安全重试", () => {
  const source = readFileSync(new URL("../app/api/installments/route.ts", import.meta.url), "utf8");
  const action = readFileSync(new URL("../app/recurring-actions.ts", import.meta.url), "utf8");
  assert.match(source, /installment-reversal:/u);
  assert.match(source, /kind='分期撤销'/u);
  assert.match(source, /duplicateInstallmentReversalResponse/u);
  assert.match(source, /occurrence_key/u);
  assert.match(action, /removeInstallment/u);
});
