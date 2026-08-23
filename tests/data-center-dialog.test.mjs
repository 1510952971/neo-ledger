import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../app/data-center-dialog.tsx", import.meta.url), "utf8");

test("data center is composed through an explicit dialog boundary", () => {
  assert.match(page, /<DataCenterDialog\b/u);
  assert.match(page, /restore=\{\{/u);
  assert.match(page, /billImport=\{\{/u);
  assert.match(page, /quickSync=\{\{/u);
  assert.doesNotMatch(page, /<dialog className="expense-dialog data-dialog"/u);
});

test("data center dialog keeps destructive and secret workflows behind callbacks", () => {
  for (const text of ["恢复 JSON 备份", "回滚到此版本", "开启屏幕隐私锁"]) {
    assert.match(dialog, new RegExp(text, "u"));
  }
  for (const component of ["BillImportSection", "NearbySyncSection", "WebdavSyncSection", "QuickSyncSection"]) {
    assert.match(dialog, new RegExp(`<${component}\\b`, "u"));
  }
  assert.match(dialog, /onRestoreFile: \(file: File \| undefined\)/u);
  assert.match(dialog, /formatCurrency=\{billImport\.formatCurrency\}/u);
  assert.match(dialog, /onRevoke=\{quickSync\.onRevoke\}/u);
});
