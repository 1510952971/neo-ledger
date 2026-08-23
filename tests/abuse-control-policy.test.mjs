import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const proxy = readFileSync("proxy.ts", "utf8");
const protocolRoutes = [
  "app/api/offline-sync/route.ts",
  "app/api/p2p/crdt/route.ts",
  "app/api/p2p/discovery/route.ts",
  "app/api/p2p/packages/route.ts",
  "app/api/p2p/signals/route.ts",
];

test("edge policy keeps protocol endpoints bounded even when the application is bypassed", () => {
  assert.match(proxy, /function limitFor\(pathname: string, method: string\)/u);
  assert.match(proxy, /method === "GET" \? 120 : 40/u);
  assert.match(proxy, /pathname === "\/api\/external\/quick-sync"/u);
  assert.match(proxy, /pathname\.startsWith\("\/api\/v1\/webhook\/"\)/u);
  assert.match(proxy, /return 60;/u);
  assert.match(proxy, /X-RateLimit-Limit/u);
  assert.match(proxy, /Retry-After/u);
});

test("edge rate-limit cleanup cannot erase auth or integration buckets", () => {
  assert.match(
    proxy,
    /DELETE FROM api_rate_limits WHERE scope NOT LIKE 'auth:%' AND scope <> 'quick-sync' AND window_start<\?/u,
  );
  assert.match(proxy, /windowStart - 3_600_000/u);
});

test("protocol routes retain application-layer body and error boundaries", () => {
  for (const route of protocolRoutes) {
    const source = readFileSync(route, "utf8");
    assert.match(source, /readJsonWithLimit/u, route);
    assert.match(source, /MAX_PROTOCOL_BODY_BYTES/u, route);
    assert.match(source, /accessErrorResponse/u, route);
  }
});
