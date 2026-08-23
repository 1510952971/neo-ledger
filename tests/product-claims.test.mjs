import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const roadmap = readFileSync(new URL("../docs/COMMERCIALIZATION_ROADMAP.md", import.meta.url), "utf8");
const ledgerSource = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");

test("public integration documentation matches the idempotency contract", () => {
  assert.match(readme, /稳定且唯一的幂等 ID/);
  assert.match(readme, /Idempotency-Key/);
  assert.match(readme, /externalId/);
  assert.doesNotMatch(readme, /每个业务事件必须提供稳定且唯一的 `Idempotency-Key`/);
});

test("current roadmap architecture evidence matches the source tree", () => {
  const lineCount = ledgerSource.trimEnd().split(/\r?\n/u).length;
  const formattedLineCount = lineCount.toLocaleString("en-US");
  const structureStart = roadmap.indexOf("### 6.1 当前结构");
  const structureEnd = roadmap.indexOf("### 6.2 UI 优点", structureStart);
  assert.ok(structureStart >= 0 && structureEnd > structureStart);
  const structure = roadmap.slice(structureStart, structureEnd);
  assert.match(structure, new RegExp(`app/ledger-app\\.tsx.*当前约 ${formattedLineCount} 行`, "u"));
  assert.doesNotMatch(structure, /7,465/u);
});
