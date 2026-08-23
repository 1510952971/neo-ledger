import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dialog = readFileSync(new URL("../app/achievement-badge-dialog.tsx", import.meta.url), "utf8");
const data = readFileSync(new URL("../app/achievement-badge-data.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");

test("achievement badge data stays versionable and complete", () => {
  assert.match(data, /export type BadgeTier/u);
  assert.match(data, /export const badgeDefinitions/u);
  assert.match(data, /code: "first_spark"/u);
  assert.match(data, /code: "debt_free_hidden"/u);
  assert.match(data, /code: "midnight_witness"/u);
  assert.match(data, /隐藏/u);
});

test("achievement badge dialog keeps focused and collection states behind callbacks", () => {
  assert.match(dialog, /focusedBadge: BadgeDefinition \| null/u);
  assert.match(dialog, /onClearFocus: \(\) => void/u);
  assert.match(dialog, /aria-label="关闭成就勋章墙"/u);
  assert.match(dialog, /type="button"/u);
  assert.match(dialog, /achievements\.some/u);
});

test("ledger app composes achievement dialog without embedding the wall", () => {
  assert.match(page, /import \{ AchievementBadgeDialog \} from "\.\/achievement-badge-dialog"/u);
  assert.match(page, /<AchievementBadgeDialog\b/u);
  assert.doesNotMatch(page, /<dialog\s+className="expense-dialog badge-dialog"/u);
  assert.doesNotMatch(page, /ACHIEVEMENT COLLECTION/u);
});

