import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

for (const [label, file] of [
  ["待确认流水", "../app/api/pending-transactions/route.ts"],
  ["附近同步包", "../app/api/p2p/packages/route.ts"],
  ["附近 CRDT 同步", "../app/api/p2p/crdt/route.ts"],
  ["账本", "../app/api/ledgers/route.ts"],
  ["安全审计", "../app/api/security/audit/route.ts"],
]) {
  test(`${label}响应使用私有不可缓存边界`, () => {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /privateJson/u);
    assert.match(source, /Cache-Control.*no-store, private, max-age=0/u);
    assert.match(source, /Pragma.*no-cache/u);
    assert.match(source, /X-Content-Type-Options.*nosniff/u);
    assert.doesNotMatch(source, /return NextResponse\.json\(\{/u);
  });
}
