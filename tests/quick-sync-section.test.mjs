import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const section = fs.readFileSync(new URL("../app/quick-sync-section.tsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/data-center-dialog.tsx", import.meta.url), "utf8");

test("automatic bookkeeping connection presentation stays outside the page coordinator", () => {
  assert.match(section, /export function QuickSyncSection/);
  assert.match(page, /import \{ QuickSyncSection \} from ["']\.\/quick-sync-section["']/);
  assert.match(page, /<QuickSyncSection\s/);
  assert.doesNotMatch(page, /<h3>自动记账连接<\/h3>/);
});

test("automatic bookkeeping connection keeps one-time secret and permission safeguards", () => {
  assert.match(section, /密钥只显示这一次/);
  assert.match(section, /ledger:write/);
  assert.match(section, /maxLength=\{60\}/);
  assert.match(section, /disabled=\{pending \|\| !label\.trim\(\)\}/);
  assert.match(section, /复制安卓配置/);
  assert.match(section, /撤销密钥/);
});

test("Android connection exposes a short three-step setup path and keeps advanced actions secondary", () => {
  assert.match(section, /Android 自动记账快速配置/u);
  assert.match(section, /生成并复制安卓配置/u);
  assert.match(section, /发送 ¥0\.01 测试账单/u);
  assert.match(section, /<details className="quick-sync-advanced">/u);
  assert.match(section, /onCreateAndCopyAndroidConfig/);
});
