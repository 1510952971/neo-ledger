import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const section = fs.readFileSync(new URL("../app/app-update-section.tsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/data-center-dialog.tsx", import.meta.url), "utf8");

test("application update presentation is extracted from the data center coordinator", () => {
  assert.match(section, /export function AppUpdateSection/);
  assert.match(page, /import \{ AppUpdateSection \} from ["']\.\/app-update-section["']/);
  assert.match(page, /<AppUpdateSection\s/);
  assert.doesNotMatch(page, /<h3>⬆️ 程序版本更新<\/h3>/);
});

test("application update presentation keeps safe action states", () => {
  assert.match(section, /disabled=\{checking \|\| applying\}/);
  assert.match(section, /!info\?\.available \|\| !info\.canApply/);
  assert.match(section, /target="_blank" rel="noreferrer"/);
  assert.match(section, /app-update-error/);
});
