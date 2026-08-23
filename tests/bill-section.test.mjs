import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("bill search and reconciliation UI stays outside the main ledger component", async () => {
  const section = await readFile("app/bill-section.tsx", "utf8");
  const parent = await readFile("app/ledger-app.tsx", "utf8");
  assert.match(section, /TRANSACTION SEARCH/u);
  assert.match(section, /CollectionPagination/u);
  assert.match(section, /reconciliation-toolbar/u);
  assert.match(section, /billPeriodLabel/u);
  assert.doesNotMatch(parent, /<section\s+className="ledger-section module-bills/u);
  assert.match(parent, /<BillSection\b/u);
});
