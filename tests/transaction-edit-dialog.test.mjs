import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/transaction-edit-dialog.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");

test("transaction editing form stays in its own financial mutation boundary", () => {
  assert.match(source, /export function TransactionEditDialog/u);
  assert.match(source, /action=\{onSubmit\}/u);
  assert.match(source, /transaction-edit-grid/u);
  assert.match(page, /<TransactionEditDialog/u);
  assert.doesNotMatch(page, /className="expense-dialog transaction-edit-dialog"/u);
});

test("transaction edit keeps account, category, mood and income callbacks explicit", () => {
  for (const name of ["onAccountChange", "onCategoryChange", "onMoodChange", "onIncomeCategoryChange"]) {
    assert.match(source, new RegExp(name, "u"));
  }
  assert.match(source, /onCancel/u);
  assert.match(source, /maxLength=\{40\}/u);
});
