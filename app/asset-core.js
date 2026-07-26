export const ASSET_TYPE_OPTIONS = [
  { name: "房产", icon: "🏠", mode: "手动估值", lifespan: 600, residualRate: 100 },
  { name: "车辆", icon: "🚗", mode: "自动折旧", lifespan: 120, residualRate: 20 },
  { name: "奢侈品", icon: "💎", mode: "手动估值", lifespan: 120, residualRate: 100 },
  { name: "贵金属", icon: "🪙", mode: "手动估值", lifespan: 120, residualRate: 100 },
  { name: "收藏品", icon: "🖼️", mode: "手动估值", lifespan: 120, residualRate: 100 },
  { name: "数码设备", icon: "💻", mode: "自动折旧", lifespan: 36, residualRate: 10 },
  { name: "游戏账号", icon: "🎮", mode: "自动折旧", lifespan: 24, residualRate: 10 },
  { name: "潮流玩具", icon: "🧸", mode: "手动估值", lifespan: 60, residualRate: 100 },
  { name: "其他资产", icon: "📦", mode: "手动估值", lifespan: 120, residualRate: 100 },
];

export const ASSET_CURRENCIES = ["CNY", "USD", "JPY", "EUR"];
export const ASSET_VALUATION_MODES = ["自动折旧", "手动估值"];

export function assetTypeIcon(assetType) {
  return (
    ASSET_TYPE_OPTIONS.find((option) => option.name === assetType)?.icon ?? "📦"
  );
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizeAssetInput(body) {
  const name = String(body?.name || "").trim().slice(0, 60);
  const assetType = String(body?.assetType || "").trim().slice(0, 24);
  const currency = String(body?.currency || "CNY").toUpperCase();
  const valuationMode = String(body?.valuationMode || "自动折旧");
  const purchasePrice = Math.round(Number(body?.purchasePrice) * 100);
  const manualValue =
    valuationMode === "手动估值"
      ? Math.round(Number(body?.manualValue) * 100)
      : null;
  const lifespanMonths = Number(body?.lifespanMonths);
  const residualRate = Number(body?.residualRate || 0);
  const purchaseDate = String(body?.purchaseDate || "");

  if (!name) throw new Error("请输入资产名称");
  if (!assetType) throw new Error("请选择或填写资产类型");
  if (!ASSET_CURRENCIES.includes(currency)) throw new Error("请选择支持的资产币种");
  if (!ASSET_VALUATION_MODES.includes(valuationMode))
    throw new Error("请选择正确的估值方式");
  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0)
    throw new Error("请输入正确的购入原值");
  if (!validDateKey(purchaseDate)) throw new Error("请选择正确的购入日期");
  const date = new Date(`${purchaseDate}T12:00:00Z`);
  if (date.getTime() > Date.now() + 86400000)
    throw new Error("购入日期不能晚于今天");

  if (valuationMode === "自动折旧") {
    if (
      !Number.isInteger(lifespanMonths) ||
      lifespanMonths < 1 ||
      lifespanMonths > 1200
    )
      throw new Error("预期寿命应为 1—1200 个月");
    if (!Number.isFinite(residualRate) || residualRate < 0 || residualRate > 100)
      throw new Error("残值率应为 0—100%");
  } else if (!Number.isFinite(manualValue) || manualValue < 0) {
    throw new Error("请输入正确的当前估值");
  }

  const heatLevel =
    assetType === "游戏账号" && ["高", "中", "低"].includes(body?.heatLevel)
      ? body.heatLevel
      : null;

  return {
    name,
    assetType,
    currency,
    valuationMode,
    purchasePrice,
    manualValue,
    purchaseDate,
    lifespanMonths: valuationMode === "自动折旧" ? lifespanMonths : 120,
    residualRateBps:
      valuationMode === "自动折旧" ? Math.round(residualRate * 100) : 0,
    heatLevel,
  };
}

export function evaluateTrackedAsset(asset, now = new Date()) {
  const purchased = new Date(`${asset.purchaseDate}T12:00:00Z`);
  const elapsedMonths = Math.max(
    0,
    (now.getTime() - purchased.getTime()) / (86400000 * 30.4375),
  );
  const manualMode = asset.valuationMode === "手动估值";
  const residualValue = manualMode
    ? Math.max(0, Number(asset.manualValue ?? asset.purchasePrice))
    : Math.round(asset.purchasePrice * (asset.residualRateBps / 10000));
  const heatLambda =
    !manualMode && asset.assetType === "游戏账号"
      ? asset.heatLevel === "高"
        ? 0.008
        : asset.heatLevel === "低"
          ? 0.04
          : 0.02
      : 0;
  const lifeFactor = Math.max(0, 1 - elapsedMonths / asset.lifespanMonths);
  const modeledValue = manualMode
    ? residualValue
    : Math.round(
        asset.purchasePrice * lifeFactor * Math.exp(-heatLambda * elapsedMonths),
      );
  const currentValue = manualMode
    ? residualValue
    : Math.max(residualValue, modeledValue);
  const valueChange = currentValue - asset.purchasePrice;
  const valueLost = Math.max(0, -valueChange);
  const reachedFloor = manualMode || currentValue <= residualValue;
  const nextMonth = Math.min(
    asset.lifespanMonths,
    elapsedMonths + 1 / 30.4375,
  );
  const nextValue = reachedFloor
    ? currentValue
    : Math.max(
        residualValue,
        Math.round(
          asset.purchasePrice *
            Math.max(0, 1 - nextMonth / asset.lifespanMonths) *
            Math.exp(-heatLambda * nextMonth),
        ),
      );

  return {
    ...asset,
    currency: asset.currency || "CNY",
    valuationMode: manualMode ? "手动估值" : "自动折旧",
    manualValue: asset.manualValue ?? null,
    elapsedMonths: Number(elapsedMonths.toFixed(2)),
    currentValue,
    residualValue,
    valueChange,
    valueLost,
    changePercent: Number(
      ((valueChange / Math.max(1, asset.purchasePrice)) * 100).toFixed(1),
    ),
    lossPercent: Number(
      ((valueLost / Math.max(1, asset.purchasePrice)) * 100).toFixed(1),
    ),
    dailyDepreciation: reachedFloor
      ? 0
      : Math.max(0, currentValue - nextValue),
    heatLambda,
  };
}
