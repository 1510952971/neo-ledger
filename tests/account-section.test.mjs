import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/account-section.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");

test("account portfolio presentation stays outside the main ledger page", () => {
  assert.match(source, /export function AccountSection/u);
  assert.match(source, /MONEY POCKETS/u);
  assert.match(page, /<AccountSection/u);
  assert.doesNotMatch(page, /className="accounts-section module-assets"/u);
});

test("account section keeps repayment, investment and currency display boundaries", () => {
  assert.match(source, /account\.type === "负债"/u);
  assert.match(source, /account\.isInvestment/u);
  assert.match(source, /exchangeRates\[account\.currency\]/u);
  assert.match(source, /onEditAccount\(account\)/u);
});
