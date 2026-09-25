import { NextResponse } from "next/server";
import {
  ensureDb,
  evaluateDigitalAsset,
  FX_TO_CNY,
  getDbBinding,
  type DigitalAssetRow,
} from "../../../db";
import { claimAndRequireLedger, guardedApiResponse } from "../../api-security";

function privateJson(body: unknown) {
  const headers = new Headers({
    "Cache-Control": "no-store, private, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  return NextResponse.json(body, { headers });
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取现金流预测失败", async () => {
  await ensureDb();
  const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1),
    db = getDbBinding();
  await claimAndRequireLedger(request, ledgerId);
  const accountRows = await db
    .prepare(
      "SELECT type,asset_class assetClass,currency,COALESCE(SUM(current_balance),0) balance FROM accounts WHERE ledger_id=? GROUP BY type,asset_class,currency",
    )
    .bind(ledgerId)
    .all<{
      type: string;
      assetClass: string;
      currency: keyof typeof FX_TO_CNY;
      balance: number;
    }>();
  const accountAssetTotal = (accountRows.results ?? [])
    .filter((row) => row.type === "资产")
    .reduce(
      (sum, row) =>
        sum + Math.max(0, Number(row.balance)) * FX_TO_CNY[row.currency],
      0,
    );
  const liabilityTotal = (accountRows.results ?? [])
    .filter((row) => row.type === "负债")
    .reduce(
      (sum, row) => sum + Math.abs(Number(row.balance)) * FX_TO_CNY[row.currency],
      0,
    );
  const allocation = (["现金流", "固收防守", "风险进攻"] as const).map(
    (assetClass) => ({
      assetClass,
      amount: Math.round(
        (accountRows.results ?? [])
          .filter((row) => row.type === "资产" && row.assetClass === assetClass)
          .reduce(
            (sum, row) =>
              sum + Math.max(0, Number(row.balance)) * FX_TO_CNY[row.currency],
            0,
          ),
      ),
    }),
  );
  const digitalAssetRows = await db
    .prepare(
      "SELECT id,ledger_id ledgerId,name,asset_type assetType,currency,valuation_mode valuationMode,manual_value manualValue,purchase_price purchasePrice,purchase_date purchaseDate,lifespan_months lifespanMonths,residual_rate_bps residualRateBps,heat_level heatLevel,updated_at updatedAt,created_at createdAt FROM digital_assets WHERE ledger_id=?",
    )
    .bind(ledgerId)
    .all<DigitalAssetRow>();
  const digitalAssetTotal = (digitalAssetRows.results ?? []).reduce(
    (sum, row) =>
      sum + evaluateDigitalAsset(row).currentValue * FX_TO_CNY[row.currency],
    0,
  );
  const savings = await db
    .prepare("SELECT COALESCE(SUM(saved_amount),0) total FROM savings_goals WHERE ledger_id=?")
    .bind(ledgerId)
    .first<{ total: number }>();
  const economic = await db
    .prepare(
      "SELECT inflation_bps inflationBps FROM economic_settings WHERE ledger_id=?",
    )
    .bind(ledgerId)
    .first<{ inflationBps: number }>();
  const inflationRate = Number(economic?.inflationBps ?? 250) / 100;
  const assetTotal = accountAssetTotal + (savings?.total || 0) + digitalAssetTotal;
  const netWorth = assetTotal - liabilityTotal;
  const spent = await db
    .prepare(
      "SELECT COALESCE(SUM(amount*(CASE currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN 0.0462 WHEN 'EUR' THEN 7.85 ELSE 1 END)),0) total, COUNT(DISTINCT date(occurred_at)) activeDays FROM transactions WHERE ledger_id=? AND type='支出' AND occurred_at>=datetime('now','-90 days') AND title NOT LIKE '自动续费 · %'",
    )
    .bind(ledgerId)
    .first<{ total: number; activeDays: number }>();
  const recurring = await db
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN cycle='每年' THEN amount/12.0 ELSE amount END),0) monthly FROM subscriptions WHERE ledger_id=? AND is_paused=0",
    )
    .bind(ledgerId)
    .first<{ monthly: number }>();
  const monthlyFixed = recurring?.monthly || 0,
    hasSpendingData = (spent?.activeDays || 0) > 0 || monthlyFixed > 0,
    dailyBurn = (spent?.total || 0) / Math.max(90, spent?.activeDays || 0),
    start = netWorth;
  const points = [] as {
    label: string;
    date: string;
    balance: number;
    danger: boolean;
  }[];
  let balance = start,
    bankruptcyDate: string | null = null;
  const now = new Date();
  for (let month = 0; month <= 12; month++) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + month, 1),
    );
    if (month > 0) balance -= dailyBurn * 30.4375 + monthlyFixed;
    const danger = balance < 0;
    if (danger && !bankruptcyDate) {
      const days = Math.max(
        0,
        Math.floor(
          (start - monthlyFixed) / (dailyBurn + monthlyFixed / 30.4375),
        ),
      );
      const zero = new Date(now);
      zero.setUTCDate(zero.getUTCDate() + days);
      bankruptcyDate = zero.toISOString().slice(0, 10);
    }
    points.push({
      label: `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月`,
      date: date.toISOString().slice(0, 10),
      balance: Math.round(balance),
      danger,
    });
  }
  const burnPerDay = dailyBurn + monthlyFixed / 30.4375;
  const runwayDays = burnPerDay > 0
    ? Math.max(0, Math.floor(start / burnPerDay))
    : null;
  return privateJson({
    netWorth: Math.round(netWorth),
    assetTotal: Math.round(assetTotal),
    accountAssetTotal: Math.round(accountAssetTotal),
    digitalAssetTotal: Math.round(digitalAssetTotal),
    liabilityTotal: Math.round(liabilityTotal),
    debtRatio: Number(
      ((liabilityTotal / Math.max(1, assetTotal)) * 100).toFixed(2),
    ),
    allocation,
    inflationRate,
    realNetWorthOneYear: Math.round(netWorth / (1 + inflationRate / 100)),
    averageDailySpend: Math.round(dailyBurn),
    monthlyFixed: Math.round(monthlyFixed),
    bankruptcyDate,
    runwayDays,
    hasSpendingData,
    dataStatus: hasSpendingData ? "ok" : "insufficient_data",
    points,
  });
  });
}
