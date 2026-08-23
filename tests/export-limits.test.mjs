import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { encodedExportBytes, estimateExportBytes, MAX_EXPORT_ESTIMATED_BYTES } from "../app/export-limits.ts";

test("export byte measurement uses UTF-8 wire size", () => {
  assert.equal(encodedExportBytes("abc"), 3);
  assert.equal(encodedExportBytes("账"), 3);
  assert.equal(encodedExportBytes("x".repeat(MAX_EXPORT_ESTIMATED_BYTES + 1)), MAX_EXPORT_ESTIMATED_BYTES + 1);
});

test("export estimate is finite and monotonic", () => {
  assert.equal(estimateExportBytes({ transactions: 0, otherRecords: 0 }), 64 * 1024);
  assert.ok(estimateExportBytes({ transactions: 10, otherRecords: 5 }) > estimateExportBytes({ transactions: 10, otherRecords: 4 }));
  assert.ok(estimateExportBytes({ transactions: 1000, otherRecords: 0 }) < MAX_EXPORT_ESTIMATED_BYTES);
  assert.ok(estimateExportBytes({ transactions: 100000, otherRecords: 0 }) > MAX_EXPORT_ESTIMATED_BYTES);
});

test("export estimate contains malformed counts", () => {
  assert.equal(estimateExportBytes({ transactions: -10, otherRecords: Number.NaN }), 64 * 1024);
  assert.ok(Number.isSafeInteger(estimateExportBytes({ transactions: "100" , otherRecords: "20" })));
});

test("export preflight counts every collection materialized by the route", () => {
  const source = fs.readFileSync(new URL("../app/api/data/export/route.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /export async function GET\(request: Request\) \{\s*try \{\s*await ensureDb\(\)/u,
    "database initialization must stay inside the sanitized error boundary",
  );
  assert.match(source, /encodedExportBytes\(body\)/u, "download response must enforce the actual UTF-8 byte budget");
  assert.match(source, /return privateDownload\(jsonBody/u, "JSON export must use the bounded download helper");
  for (const table of [
    "transactions",
    "accounts",
    "budget_settings",
    "category_budgets",
    "subscriptions",
    "savings_goals",
    "members",
    "installments",
    "achievements",
    "side_hustle_deductions",
    "pending_transactions",
    "system_notifications",
    "fire_settings",
    "economic_settings",
    "crdt_tombstones",
    "digital_assets",
    "expense_categories",
    "income_categories",
    "account_transfers",
    "sync_tombstones",
    "transaction_reconciliation",
    "automation_rules",
  ]) {
    assert.match(source, new RegExp(`countLedgerRows\\(\\"${table}\\"`), `missing capacity count for ${table}`);
  }
  assert.match(source, /SELECT COUNT\(\*\) count FROM ledgers WHERE owner_id=\?/u);
});
