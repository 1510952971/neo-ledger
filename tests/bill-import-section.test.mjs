import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const section = fs.readFileSync(new URL("../app/bill-import-section.tsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/data-center-dialog.tsx", import.meta.url), "utf8");

test("bill import workspace stays in a dedicated presentation boundary", () => {
  assert.match(section, /export function BillImportSection/);
  assert.match(page, /import \{ BillImportSection \} from ["']\.\/bill-import-section["']/);
  assert.match(page, /<BillImportSection\s/);
  assert.doesNotMatch(page, /<h3>📥 全平台账单导入<\/h3>/);
});

test("bill import keeps file, reconciliation and account safety controls", () => {
  assert.match(section, /type="file" multiple/);
  assert.match(section, /确认并批量入库/);
  assert.match(section, /账户识别与导入/);
  assert.match(section, /disabled=\{pending \|\| items\.some/);
  assert.match(section, /可能与已有流水重复/);
  assert.match(section, /撤销整批/);
  assert.match(section, /清理误识别声明账单/);
});
