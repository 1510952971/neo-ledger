import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("authenticated ledger guards never auto-claim orphan ledgers", () => {
  const security = read("app/api-security.ts");
  const claim = security.match(/export async function claimLedgerForOwner[\s\S]*?export async function getOwnerPreferences/u)?.[0] ?? "";
  assert.match(claim, /if \(ownerId === "local"\)[\s\S]{0,260}UPDATE ledgers SET owner_id=/u);

  const page = read("app/page.tsx");
  const serverActionGuard = page.match(/async function requireOwnedLedger[\s\S]*?async function addTransaction/u)?.[0] ?? "";
  assert.match(serverActionGuard, /if \(ownerId === "local"\)[\s\S]{0,260}UPDATE ledgers SET owner_id=/u);
});

test("bulk legacy-ledger adoption stays behind the local compatibility boundary", () => {
  for (const path of [
    "app/api/ledgers/route.ts",
    "app/api/data/export/route.ts",
    "app/api/data/restore/route.ts",
  ]) {
    const source = read(path);
    assert.match(source, /if \(ownerId === "local"\)[\s\S]{0,260}UPDATE ledgers SET owner_id=/u, path);
  }
});

test("server actions share bounded financial input helpers", () => {
  const page = read("app/page.tsx");
  assert.match(page, /from "\.\/server-action-input"/u);
  for (const helper of ["actionMoneyCents", "actionPositiveInteger", "actionTimezone", "boundedActionText"])
    assert.match(page, new RegExp(`\\b${helper}\\b`, "u"), helper);
  assert.match(page, /boundedActionText\(text, 64 \* 1024/u);
});
