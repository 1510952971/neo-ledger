import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("AI 月度分类上下文在数据库聚合层有界", () => {
  const source = fs.readFileSync(new URL("../app/api/v1/ai/chat/route.ts", import.meta.url), "utf8");
  assert.match(source, /const AI_CATEGORY_LIMIT = 200/u);
  assert.match(source, /GROUP BY COALESCE\(category_dynamic,category,'未分类'\) ORDER BY amount DESC LIMIT \?/u);
  assert.match(source, /\.bind\(ledgerId, AI_CATEGORY_LIMIT\)/u);
});

test("AI 财务摘要响应禁止缓存并阻止内容嗅探", () => {
  const source = fs.readFileSync(new URL("../app/api/v1/ai/chat/route.ts", import.meta.url), "utf8");
  assert.match(source, /function privateJson\(body: unknown/u);
  assert.match(source, /headers\.set\("Cache-Control", "no-store, private, max-age=0"\)/u);
  assert.match(source, /headers\.set\("Pragma", "no-cache"\)/u);
  assert.match(source, /headers\.set\("X-Content-Type-Options", "nosniff"\)/u);
  assert.equal((source.match(/return privateJson\(/gu) ?? []).length, 3);
});
