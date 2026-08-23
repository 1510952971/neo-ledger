import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

for (const [label, file] of [
  ["附近设备发现", "../app/api/p2p/discovery/route.ts"],
  ["附近同步包", "../app/api/p2p/packages/route.ts"],
  ["附近信令", "../app/api/p2p/signals/route.ts"],
  ["附近 CRDT 同步", "../app/api/p2p/crdt/route.ts"],
]) {
  test(`${label}写接口具备同源校验`, () => {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /requireSameOrigin\(request\)/u);
  });
}
