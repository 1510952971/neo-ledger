import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("transaction live sync uses the shared ledger revision", async () => {
  const hook = await source("app/transaction-live-sync-state.ts");
  const route = await source("app/api/transactions/revision/route.ts");
  const db = await source("db/index.ts");

  assert.match(hook, /\/api\/transactions\/revision\?/u);
  assert.doesNotMatch(hook, /limit:\s*["']1["']/u);
  assert.match(route, /ledger_revisions/u);
  assert.match(db, /transactions_revision_insert/u);
  assert.match(db, /transactions_revision_delete/u);
});
