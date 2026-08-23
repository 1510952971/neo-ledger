import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

for (const [label, file] of [
  ["账户", "../app/api/accounts/route.ts"],
  ["支出分类", "../app/api/categories/route.ts"],
  ["收入分类", "../app/api/income-categories/route.ts"],
]) {
  test(`${label}写入响应使用私有不可缓存边界`, () => {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /function privateJson\(body: unknown/u);
    assert.match(source, /Cache-Control.*no-store, private, max-age=0/u);
    assert.match(source, /Pragma.*no-cache/u);
    assert.match(source, /X-Content-Type-Options.*nosniff/u);
    assert.doesNotMatch(source, /return NextResponse\.json\(\{ ok: true/u);
  });
}
