import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

for (const [label, file] of [
  ["附近设备发现", "../app/api/p2p/discovery/route.ts"],
  ["附近设备信令", "../app/api/p2p/signals/route.ts"],
]) {
  test(`${label}响应使用私有不可缓存边界`, () => {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /function privateJson\(body: unknown/u);
    assert.match(source, /Cache-Control.*no-store, private, max-age=0/u);
    assert.match(source, /Pragma.*no-cache/u);
    assert.match(source, /X-Content-Type-Options.*nosniff/u);
    if (label === "附近设备信令") {
      assert.match(source, /DELETE FROM peer_signals WHERE created_at<datetime\('now','-15 minutes'\)/u);
    }
    assert.doesNotMatch(source, /return NextResponse\.json\(\{/u);
  });
}

test("P2P 信令读取和写入都会清理过期记录", () => {
  const source = fs.readFileSync(new URL("../app/api/p2p/signals/route.ts", import.meta.url), "utf8");
  assert.equal(
    (source.match(/DELETE FROM peer_signals WHERE created_at<datetime\('now','-15 minutes'\)/gu) ?? []).length,
    2,
  );
});
