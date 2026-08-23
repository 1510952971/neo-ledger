import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/onboarding-card.tsx", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../app/onboarding-state.ts", import.meta.url), "utf8");

test("first-run guidance is skippable and never seeds demo transactions", () => {
  assert.match(source, /if \(hasTransactions\) return null/);
  assert.match(source, /onDismiss/);
  assert.match(source, /不会自动写入演示数据/);
  assert.match(source, /type="button"/);
  assert.match(source, /aria-labelledby="onboarding-title"/);
  assert.match(stateSource, /localStorage/);
});

test("first-run actions expose entry and import paths", () => {
  assert.match(source, /onOpenEntry/);
  assert.match(source, /onOpenImport/);
  assert.match(source, /记第一笔/);
  assert.match(source, /导入账单/);
});
