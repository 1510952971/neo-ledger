import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../app/ledger-menu-dialog.tsx", import.meta.url), "utf8");

test("ledger switcher and destructive action use a dedicated dialog boundary", () => {
  assert.match(page, /<LedgerMenuDialog\b/u);
  assert.match(page, /onSelect=\{\(ledgerId\) => router\.push/u);
  assert.doesNotMatch(page, /<dialog className="expense-dialog ledger-menu-dialog"/u);
});

test("ledger dialog keeps last-ledger protection and explicit commands", () => {
  assert.match(dialog, /ledgers\.length <= 1/u);
  assert.match(dialog, /disabled=\{pending \|\| ledgers\.length <= 1\}/u);
  assert.match(dialog, /onClick=\{\(\) => void onCreate\(\)\}/u);
  assert.match(dialog, /onClick=\{\(\) => void onDelete\(\)\}/u);
});
