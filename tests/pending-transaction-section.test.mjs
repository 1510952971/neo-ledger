import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sectionSource = readFileSync(new URL("../app/pending-transaction-section.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/notification-dialog.tsx", import.meta.url), "utf8");

test("pending transaction triage is an explicit presentation boundary", () => {
  assert.match(sectionSource, /export function PendingTransactionSection/u);
  assert.match(sectionSource, /onProcess\(/u);
  assert.match(sectionSource, /onRefresh\(/u);
  assert.match(sectionSource, /action\?: "confirm" \| "ignore"/u);
  assert.match(pageSource, /<PendingTransactionSection\b/u);
  assert.doesNotMatch(pageSource, /pendingFlows\.map\(/u);
  assert.doesNotMatch(pageSource, /待确认流水洗牌区/u);
});

test("pending triage keeps the three user decisions visible", () => {
  assert.match(sectionSource, /应用规则建议/u);
  assert.match(sectionSource, /一键补全分类/u);
  assert.match(sectionSource, /忽略并回滚/u);
  assert.match(sectionSource, /onProcess\(item\.id, undefined, "ignore"\)/u);
});
