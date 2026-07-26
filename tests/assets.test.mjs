import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateTrackedAsset,
  normalizeAssetInput,
} from "../app/asset-core.js";

test("manual valuation supports appreciating property in its original currency", () => {
  const value = normalizeAssetInput({
    name: "柏林公寓",
    assetType: "房产",
    currency: "EUR",
    valuationMode: "手动估值",
    purchasePrice: 300000,
    manualValue: 365000,
    purchaseDate: "2020-06-15",
  });
  const asset = evaluateTrackedAsset(
    { id: 1, ledgerId: 1, createdAt: "", ...value },
    new Date("2026-07-17T00:00:00Z"),
  );

  assert.equal(asset.currency, "EUR");
  assert.equal(asset.currentValue, 36_500_000);
  assert.equal(asset.valueChange, 6_500_000);
  assert.equal(asset.changePercent, 21.7);
  assert.equal(asset.dailyDepreciation, 0);
});

test("custom asset types remain valid instead of being forced into presets", () => {
  const value = normalizeAssetInput({
    name: "演奏级钢琴",
    assetType: "乐器",
    currency: "CNY",
    valuationMode: "手动估值",
    purchasePrice: 180000,
    manualValue: 210000,
    purchaseDate: "2024-01-02",
  });

  assert.equal(value.assetType, "乐器");
  assert.equal(value.valuationMode, "手动估值");
  assert.equal(value.manualValue, 21_000_000);
});

test("automatic vehicle depreciation never falls below its residual floor", () => {
  const value = normalizeAssetInput({
    name: "家用车",
    assetType: "车辆",
    currency: "CNY",
    valuationMode: "自动折旧",
    purchasePrice: 200000,
    purchaseDate: "2010-01-01",
    lifespanMonths: 120,
    residualRate: 20,
  });
  const asset = evaluateTrackedAsset(
    { id: 2, ledgerId: 1, createdAt: "", ...value },
    new Date("2026-07-17T00:00:00Z"),
  );

  assert.equal(asset.currentValue, 4_000_000);
  assert.equal(asset.residualValue, 4_000_000);
  assert.equal(asset.dailyDepreciation, 0);
  assert.equal(asset.changePercent, -80);
});

test("asset validation rejects impossible dates and unsupported currencies", () => {
  const base = {
    name: "测试资产",
    assetType: "其他",
    valuationMode: "手动估值",
    purchasePrice: 100,
    manualValue: 100,
    purchaseDate: "2026-02-30",
  };
  assert.throws(() => normalizeAssetInput({ ...base, currency: "CNY" }), /日期/);
  assert.throws(
    () =>
      normalizeAssetInput({
        ...base,
        purchaseDate: "2026-02-28",
        currency: "GBP",
      }),
    /币种/,
  );
});
