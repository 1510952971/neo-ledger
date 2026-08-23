import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("账单导入重复检测先统计并限制历史候选流水", () => {
  const source = fs.readFileSync(new URL("../app/api/bill-import/route.ts", import.meta.url), "utf8");
  assert.match(source, /const MAX_IMPORT_EXISTING_ROWS = 50_000/u);
  assert.match(source, /SELECT COUNT\(\*\) count FROM transactions WHERE ledger_id=\? AND occurred_at>=\? AND occurred_at<=\?/u);
  assert.match(source, /Number\(count\?\.count \?\? 0\) > MAX_IMPORT_EXISTING_ROWS/u);
  assert.match(source, /ORDER BY occurred_at,id LIMIT \?/u);
  assert.match(source, /缩小时间范围后分批导入/u);
});

test("黑名单清理先统计并限制删除候选流水", () => {
  const source = fs.readFileSync(new URL("../app/api/bill-import/route.ts", import.meta.url), "utf8");
  assert.match(source, /const MAX_IMPORT_CLEANUP_ROWS = 20_000/u);
  assert.match(source, /const matchingCount = await db[\s\S]*?SELECT COUNT\(\*\) count FROM transactions/u);
  assert.match(source, /Number\(matchingCount\?\.count \?\? 0\) > MAX_IMPORT_CLEANUP_ROWS/u);
  assert.match(source, /ORDER BY id LIMIT \?/u);
  assert.match(source, /按导入批次分批撤销/u);
});

test("账单导入的解析、批次和清理响应统一私有化", () => {
  const source = fs.readFileSync(new URL("../app/api/bill-import/route.ts", import.meta.url), "utf8");
  assert.match(source, /function privateJson\(body: unknown/u);
  assert.match(source, /Cache-Control.*no-store, private, max-age=0/u);
  assert.match(source, /Pragma.*no-cache/u);
  assert.match(source, /X-Content-Type-Options.*nosniff/u);
  assert.equal((source.match(/return privateJson\(/gu) ?? []).length, 12);
});

test("账单导入的账户和分类查询遵守集合容量上限", () => {
  const source = fs.readFileSync(new URL("../app/api/bill-import/route.ts", import.meta.url), "utf8");
  assert.match(source, /import \{ MAX_ACCOUNT_COUNT \} from "\.\.\/\.\.\/account-limits"/u);
  assert.match(source, /import \{ MAX_CATEGORY_COUNT \} from "\.\.\/\.\.\/category-limits"/u);
  assert.match(source, /FROM accounts WHERE ledger_id=\? ORDER BY id LIMIT \?/u);
  assert.match(source, /FROM expense_categories WHERE ledger_id=\? AND is_active=1 ORDER BY sort_order,id LIMIT \?/u);
  assert.match(source, /FROM income_categories WHERE ledger_id=\? AND is_active=1 ORDER BY sort_order,id LIMIT \?/u);
});
