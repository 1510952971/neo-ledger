import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("P2P CRDT 合并对字段、金额、币种和集合形状做边界校验", () => {
  const source = fs.readFileSync(new URL("../app/api/p2p/crdt/route.ts", import.meta.url), "utf8");
  assert.match(source, /function normalizeIncoming\(value: unknown\)/u);
  assert.match(source, /Number\.isSafeInteger\(amount\)/u);
  assert.match(source, /amount > 100_000_000_000/u);
  assert.match(source, /currencies = new Set\(\["CNY", "USD", "JPY", "EUR"\]\)/u);
  assert.match(source, /Array\.isArray\(body\.transactions\)/u);
  assert.match(source, /Array\.isArray\(body\.tombstones\)/u);
});

test("P2P CRDT 自动创建分类遵守账本分类上限", () => {
  const source = fs.readFileSync(new URL("../app/api/p2p/crdt/route.ts", import.meta.url), "utf8");
  assert.match(source, /MAX_CATEGORY_COUNT/u);
  assert.match(source, /COUNT\(\*\).*expense_categories.*< \?/su);
  assert.match(source, /COUNT\(\*\).*income_categories.*< \?/su);
});
