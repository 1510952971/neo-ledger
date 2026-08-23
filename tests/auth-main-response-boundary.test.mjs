import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("认证主路由成功响应统一使用私有不可缓存边界", () => {
  const source = fs.readFileSync(new URL("../app/api/auth/route.ts", import.meta.url), "utf8");
  assert.match(source, /function privateJson\(body: unknown/u);
  assert.match(source, /Cache-Control.*no-store, private, max-age=0/u);
  assert.match(source, /Pragma.*no-cache/u);
  assert.match(source, /X-Content-Type-Options.*nosniff/u);
  assert.ok((source.match(/privateJson\(/gu) ?? []).length >= 7);
});
