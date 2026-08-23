import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

for (const [label, file] of [
  ["分类预算", "../app/api/category-budgets/route.ts"],
  ["分期", "../app/api/installments/route.ts"],
  ["储蓄目标", "../app/api/savings-goals/route.ts"],
  ["订阅", "../app/api/subscriptions/route.ts"],
]) {
  test(`${label}写入响应使用私有不可缓存边界`, () => {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /function privateJson\(body: unknown/u);
    assert.match(source, /Cache-Control.*no-store, private, max-age=0/u);
    assert.match(source, /Pragma.*no-cache/u);
    assert.match(source, /X-Content-Type-Options.*nosniff/u);
    assert.doesNotMatch(source, /return NextResponse\.json\(\{/u);
    if (label === "分期") assert.match(source, /export async function DELETE\(request: Request\) \{\s*try \{/u);
  });
}
