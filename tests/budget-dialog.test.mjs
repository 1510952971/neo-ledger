import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/budget-dialog.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");

test("budget dialog keeps amount and ledger boundaries explicit", () => {
  assert.match(source, /name="ledgerId"/u);
  assert.match(source, /name="budget"/u);
  assert.match(source, /min="0\.01"/u);
  assert.match(source, /onSubmit/iu);
  assert.match(source, /aria-label="关闭预算窗口"/u);
});

test("ledger page composes budget dialog instead of embedding its form", () => {
  assert.match(page, /<BudgetDialog\b/u);
  assert.doesNotMatch(page, /<dialog\s+className="expense-dialog budget-dialog"/u);
});
