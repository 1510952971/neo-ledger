import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sectionSource = readFileSync(new URL("../app/account-dialogs.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");

test("account and transfer forms stay in a dedicated presentation boundary", () => {
  assert.match(sectionSource, /export function AccountDialogs/u);
  assert.match(sectionSource, /submitTransfer/u);
  assert.match(sectionSource, /submitAccount/u);
  assert.match(sectionSource, /onRemoveAccount/u);
  assert.match(pageSource, /<AccountDialogs\b/u);
  assert.doesNotMatch(pageSource, /<h2>账户转账 \/ 信用卡还款<\/h2>/u);
  assert.doesNotMatch(pageSource, /<h2>\{editingAccount \? "编辑账户"/u);
});

test("account dialog preserves financial safeguards and account-type branches", () => {
  assert.match(sectionSource, /name="amount" type="number" min="0\.01"/u);
  assert.match(sectionSource, /name="note" maxLength=\{120\}/u);
  assert.match(sectionSource, /name="balance"/u);
  assert.match(sectionSource, /name="billDay"/u);
  assert.match(sectionSource, /name="repaymentDay"/u);
  assert.doesNotMatch(sectionSource, /name="expectedUpdatedAt"/u);
});
