import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/installment-dialog.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");

test("installment dialog preserves bounded financial fields", () => {
  assert.match(source, /name="totalAmount"/u);
  assert.match(source, /name="feeAmount"/u);
  assert.match(source, /name="chargeDay"/u);
  assert.match(source, /name="accountId"/u);
  assert.match(source, /name="paymentAccountId"/u);
  assert.match(source, /min="0\.01"/u);
  assert.match(source, /max="31"/u);
});

test("ledger page composes installment dialog instead of embedding it", () => {
  assert.match(page, /<InstallmentDialog\b/u);
  assert.doesNotMatch(page, /<dialog\s+className="expense-dialog account-dialog"[\s\S]{0,300}新增大件分期/u);
});
