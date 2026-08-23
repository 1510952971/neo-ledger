import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("待确认流水写入契约限制动作、编号和分类长度", async () => {
  const source = await readFile(new URL("../app/internal-api-contract.ts", import.meta.url), "utf8");
  assert.match(source, /pendingTransactionSchema/u);
  assert.match(source, /z\.enum\(\["confirm", "ignore"\]\)/u);
  assert.match(source, /category: z\.string\(\)\.trim\(\)\.min\(1.*\.max\(40\)/u);
  assert.match(source, /readPendingTransactionInput/u);
});
