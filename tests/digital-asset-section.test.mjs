import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/digital-asset-section.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");

test("asset valuation presentation stays outside the main ledger page", () => {
  assert.match(source, /export function DigitalAssetSection/u);
  assert.match(source, /UNIVERSAL ASSET VAULT/u);
  assert.match(page, /<DigitalAssetSection/u);
  assert.doesNotMatch(page, /className="digital-assets-section module-assets page-scroll-anchor"/u);
});

test("asset section keeps valuation direction, depreciation and pagination boundaries", () => {
  assert.match(source, /valueDirection/u);
  assert.match(source, /valuationMode === "手动估值"/u);
  assert.match(source, /onPageChange\(page/u);
  assert.match(source, /onLiquidate\(asset\)/u);
});
