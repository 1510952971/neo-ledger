import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dialogSource = fs.readFileSync(new URL("../app/category-dialogs.tsx", import.meta.url), "utf8");
const pageSource = fs.readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");

test("category management dialogs are extracted from the page coordinator", () => {
  assert.match(dialogSource, /export function CategoryDialogs/);
  assert.match(pageSource, /import \{ CategoryDialogs \} from ["']\.\/category-dialogs["']/);
  assert.match(pageSource, /<CategoryDialogs\s/);
  assert.doesNotMatch(pageSource, /<h2>收入分类工作室<\/h2>/);
  assert.doesNotMatch(pageSource, /<h2>消费分类工作室<\/h2>/);
});

test("category editor keeps bounded fields and safe lifecycle actions", () => {
  assert.match(dialogSource, /name="icon"/);
  assert.match(dialogSource, /name="name"/);
  assert.match(dialogSource, /type="color"/);
  assert.match(dialogSource, /maxLength=\{12\}/);
  assert.match(dialogSource, /系统内置/);
  assert.match(dialogSource, /移除/);
  assert.match(dialogSource, /恢复/);
  assert.match(dialogSource, /key=\{editing\?\.id \?\?/);
});
