import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const section = fs.readFileSync(new URL("../app/nearby-sync-section.tsx", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/data-center-dialog.tsx", import.meta.url), "utf8");

test("nearby encrypted transfer stays in a dedicated presentation boundary", () => {
  assert.match(section, /export function NearbySyncSection/);
  assert.match(page, /import \{ NearbySyncSection \} from ["']\.\/nearby-sync-section["']/);
  assert.match(page, /<NearbySyncSection\s/);
  assert.doesNotMatch(page, /<h3>📲 附近设备同步<\/h3>/);
});

test("nearby transfer keeps pairing, package and device safety actions", () => {
  assert.match(section, /输入 8 位配对码/);
  assert.match(section, /disabled=\{pending \|\| !receiveCode\}/);
  assert.match(section, /15 分钟内有效/);
  assert.match(section, /onReceivePackage/);
  assert.match(section, /在线设备/);
});
