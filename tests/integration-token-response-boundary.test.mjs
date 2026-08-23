import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("自动记账集成令牌的元数据、明文令牌和撤销响应禁止缓存", () => {
  const source = fs.readFileSync(new URL("../app/api/integrations/quick-sync/route.ts", import.meta.url), "utf8");
  assert.match(source, /function privateJson\(body: unknown/u);
  assert.match(source, /Cache-Control.*no-store, private, max-age=0/u);
  assert.match(source, /Pragma.*no-cache/u);
  assert.match(source, /X-Content-Type-Options.*nosniff/u);
  assert.equal((source.match(/return privateJson\(/gu) ?? []).length, 3);
  assert.match(source, /token,/u);
});
