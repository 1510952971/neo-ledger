import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/finance-overview-section.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");

test("financial overview cards stay outside the main page coordinator", () => {
  assert.match(source, /export function FinanceOverviewSection/u);
  assert.match(source, /net-card/u);
  assert.match(source, /budget-mini-card/u);
  assert.match(page, /<FinanceOverviewSection/u);
  assert.doesNotMatch(page, /className="net-card module-assets"/u);
});

test("financial overview keeps safe budget and inflation boundaries", () => {
  assert.match(source, /budget > 0/u);
  assert.match(source, /onSaveInflation/u);
  assert.match(source, /onOpenBadges/u);
  assert.match(source, /onOpenBudget/u);
});
