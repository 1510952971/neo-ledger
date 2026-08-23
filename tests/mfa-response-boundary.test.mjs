import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("MFA secret、恢复码和状态响应使用私有不可缓存边界", () => {
  const source = fs.readFileSync(new URL("../app/api/auth/mfa/route.ts", import.meta.url), "utf8");
  assert.match(source, /function privateJson\(body: unknown/u);
  assert.match(source, /Cache-Control.*no-store, private, max-age=0/u);
  assert.match(source, /Pragma.*no-cache/u);
  assert.match(source, /X-Content-Type-Options.*nosniff/u);
  assert.ok((source.match(/return privateJson\(/gu) ?? []).length >= 6);
});
