import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { claimAndRequireLedger } from "../../api-security";

export async function GET(request: Request) {
  await ensureDb();
  const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1),
    db = getDbBinding();
  await claimAndRequireLedger(request, ledgerId);
  const balances = await db
    .prepare(
      "SELECT COALESCE(SUM((CASE WHEN type='资产' THEN current_balance ELSE -ABS(current_balance) END)*(CASE currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN 0.0462 WHEN 'EUR' THEN 7.85 ELSE 1 END)),0) netWorth FROM accounts WHERE ledger_id=?",
    )
    .bind(ledgerId)
    .first<{ netWorth: number }>();
  const savings = await db
    .prepare("SELECT COALESCE(SUM(saved_amount),0) total FROM savings_goals WHERE ledger_id=?")
    .bind(ledgerId)
    .first<{ total: number }>();
  const spent = await db
    .prepare(
      "SELECT COALESCE(SUM(amount*(CASE currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN 0.0462 WHEN 'EUR' THEN 7.85 ELSE 1 END)),0) total, COUNT(DISTINCT date(occurred_at)) activeDays FROM transactions WHERE ledger_id=? AND type='支出' AND occurred_at>=datetime('now','-90 days') AND title NOT LIKE '自动续费 · %'",
    )
    .bind(ledgerId)
    .first<{ total: number; activeDays: number }>();
  const recurring = await db
    .prepare(
      "SELECT COALESCE(SUM(CASE WHEN cycle='每年' THEN amount/12.0 ELSE amount END),0) monthly FROM subscriptions WHERE ledger_id=?",
    )
    .bind(ledgerId)
    .first<{ monthly: number }>();
  const dailyBurn = (spent?.total || 0) / Math.max(90, spent?.activeDays || 0),
    monthlyFixed = recurring?.monthly || 0,
    start = (balances?.netWorth || 0) + (savings?.total || 0);
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
  const runwayDays =
    dailyBurn + monthlyFixed / 30.4375 > 0
      ? Math.max(0, Math.floor(start / (dailyBurn + monthlyFixed / 30.4375)))
      : 9999;
  return NextResponse.json({
    netWorth: start,
    averageDailySpend: Math.round(dailyBurn),
    monthlyFixed: Math.round(monthlyFixed),
    bankruptcyDate,
    runwayDays,
    points,
  });
}
