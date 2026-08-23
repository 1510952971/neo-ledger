import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sectionSource = readFileSync(new URL("../app/transaction-entry-dialog.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");

test("quick entry stays in a dedicated financial form boundary", () => {
  assert.match(sectionSource, /export function TransactionEntryDialog/u);
  assert.match(sectionSource, /onSubmit/u);
  assert.match(sectionSource, /onConfirmParsed/u);
  assert.match(sectionSource, /onOpenCategoryManager/u);
  assert.match(pageSource, /<TransactionEntryDialog\b/u);
  assert.doesNotMatch(pageSource, /<h2>记一笔资金流<\/h2>/u);
  assert.doesNotMatch(pageSource, /entryType === "支出" \? \(\s*<>/u);
});

test("quick entry preserves split, import and friction safeguards", () => {
  assert.match(sectionSource, /name="amount" type="number" min="0\.01"/u);
  assert.match(sectionSource, /全额由我支付/u);
  assert.match(sectionSource, /按比例平摊/u);
  assert.match(sectionSource, /type="file" accept="image\/\*"/u);
  assert.match(sectionSource, /确认并一键入库/u);
  assert.match(sectionSource, /reflectionPhrase/u);
  assert.match(sectionSource, /disabled=\{pending \|\|/u);
});
