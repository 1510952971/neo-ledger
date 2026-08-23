import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

for (const [label, file] of [
  ["账号状态", "../app/api/auth/route.ts"],
  ["P2P CRDT", "../app/api/p2p/crdt/route.ts"],
  ["P2P 信令", "../app/api/p2p/signals/route.ts"],
  ["同步包读取", "../app/api/p2p/packages/route.ts"],
]) {
  test(`${label}读取响应使用私有不可缓存边界`, () => {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /function privateJson\(body: unknown/u);
    assert.match(source, /Cache-Control.*no-store, private, max-age=0/u);
    assert.match(source, /Pragma.*no-cache/u);
    assert.match(source, /X-Content-Type-Options.*nosniff/u);
    assert.match(source, /return privateJson\(/u);
  });
}
