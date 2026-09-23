import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/account-section.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");
const historyDialog = readFileSync(new URL("../app/account-transfer-history-dialog.tsx", import.meta.url), "utf8");

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

test("account transfer history is reachable from either account and privacy-safe", () => {
  assert.match(source, /onShowTransfers\(account\)/u);
  assert.match(page, /showAccountTransferHistory/u);
  assert.match(page, /fetchClientJson<AccountTransferHistoryRow\[\] \| \{ error\?: string \}>/u);
  assert.match(page, /!preferences\.response\.ok \|\| preferences\.data\?\.hideAmounts === true/u);
  assert.match(historyDialog, /row\.fromAccountName.*row\.toAccountName/u);
  assert.match(historyDialog, /hideAmounts \? "••••"/u);
});
