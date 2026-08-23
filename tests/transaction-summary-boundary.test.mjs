import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("交易摘要的动态分组输出全部有界", () => {
  const source = fs.readFileSync(new URL("../app/api/transactions/summary/route.ts", import.meta.url), "utf8");
  assert.match(source, /GROUP BY COALESCE\(t\.category_dynamic,t\.category,'未分类'\)[\s\S]*?ORDER BY amount DESC[\s\S]*?LIMIT 200/u);
  assert.match(source, /GROUP BY t\.split_with_member_id[\s\S]*?ORDER BY ABS\(balance\) DESC[\s\S]*?LIMIT 200/u);
  assert.match(source, /SELECT DISTINCT strftime\('%Y',[\s\S]*?ORDER BY year DESC LIMIT 200/u);
});

test("副业成本摘要与副业收入使用相同的月份和时区边界", () => {
  const source = fs.readFileSync(new URL("../app/api/transactions/summary/route.ts", import.meta.url), "utf8");
  assert.match(source, /FROM side_hustle_deductions d JOIN transactions t ON t\.id=d\.transaction_id[\s\S]*?WHERE d\.ledger_id=\? AND \$\{monthFilter\.sql\}/u);
  assert.match(source, /\.bind\(ledgerId, \.\.\.monthFilter\.params\)\.first<\{ amount: number \}>\(\)/u);
});
