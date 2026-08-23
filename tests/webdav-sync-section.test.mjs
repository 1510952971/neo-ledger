import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const section = fs.readFileSync(new URL("../app/webdav-sync-section.tsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/data-center-dialog.tsx", import.meta.url), "utf8");

test("WebDAV sync presentation stays outside the page coordinator", () => {
  assert.match(section, /export function WebdavSyncSection/);
  assert.match(page, /import \{ WebdavSyncSection \} from ["']\.\/webdav-sync-section["']/);
  assert.match(page, /<WebdavSyncSection\s/);
  assert.doesNotMatch(page, /<h3>多端云同步控制塔<\/h3>/);
});

test("WebDAV form keeps secret, interval and destructive-mode safeguards", () => {
  assert.match(section, /name="secret"/);
  assert.match(section, /minLength=\{8\}/);
  assert.match(section, /自动同步间隔/);
  assert.match(section, /name="mode" value="download"/);
  assert.match(section, /disabled=\{syncing\}/);
  assert.match(section, /neo-ledger\.e2ee\.json/);
});
