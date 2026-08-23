import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sectionSource = readFileSync(new URL("../app/asset-dialogs.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");

test("asset onboarding and liquidation stay in a dedicated boundary", () => {
  assert.match(sectionSource, /export function AssetDialogs/u);
  assert.match(sectionSource, /onSubmitAsset/u);
  assert.match(sectionSource, /onSubmitLiquidation/u);
  assert.match(pageSource, /<AssetDialogs\b/u);
  assert.doesNotMatch(pageSource, /<h2>\{editingAsset \? "✎ 修改资产"/u);
  assert.doesNotMatch(pageSource, /<h2>🛒 变现 \{liquidatingAsset\.name\}/u);
});

test("asset dialogs preserve valuation and liquidation safeguards", () => {
  assert.match(sectionSource, /name="purchasePrice" type="number" min="0\.01"/u);
  assert.match(sectionSource, /name="manualValue"/u);
  assert.match(sectionSource, /name="lifespanMonths"/u);
  assert.match(sectionSource, /name="residualRate"/u);
  assert.match(sectionSource, /name="salePrice" type="number" min="0\.01"/u);
  assert.match(sectionSource, /直接报废 · 不入账/u);
  assert.match(sectionSource, /确认变现并入账/u);
});
