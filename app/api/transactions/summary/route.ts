import { NextResponse } from "next/server";
import { ensureDb, FX_TO_CNY, getDbBinding } from "../../../../db";
import { claimAndRequireLedger, guardedApiResponse } from "../../../api-security";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/u;
const DIMENSIONS = new Set(["日", "月", "年"]);
const RATE_SQL = "(CASE t.currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN 0.0462 WHEN 'EUR' THEN 7.85 ELSE 1 END)";

function validDateKey(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return DATE_KEY.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

type SummaryRow = { name: string | null; amount: number };
type PeriodSummary = {
  income: number;
  expense: number;
  balance: number;
  count: number;
  topCategory: string | null;
  topCategoryAmount: number;
};

function privateJson(body: unknown) {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { headers });
}

function periodPredicate(scope: "day" | "month" | "year", anchor: string, dateExpr: string) {
  if (scope === "day") return { sql: `date(${dateExpr})=?`, value: anchor };
  if (scope === "month") return { sql: `strftime('%Y-%m',${dateExpr})=?`, value: anchor.slice(0, 7) };
  return { sql: `strftime('%Y',${dateExpr})=?`, value: anchor.slice(0, 4) };
}

function periodBounds(scope: "day" | "month" | "year", anchor: string, offsetMinutes: number) {
  const localStart = scope === "day"
    ? `${anchor}T00:00:00Z`
    : scope === "month"
      ? `${anchor.slice(0, 7)}-01T00:00:00Z`
      : `${anchor.slice(0, 4)}-01-01T00:00:00Z`;
  const start = new Date(localStart);
  const end = new Date(start);
  if (scope === "day") end.setUTCDate(end.getUTCDate() + 1);
  else if (scope === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCFullYear(end.getUTCFullYear() + 1);
  const shift = offsetMinutes * 60_000;
  return {
    from: new Date(start.getTime() - shift).toISOString(),
    to: new Date(end.getTime() - shift).toISOString(),
  };
}

function periodClause(scope: "day" | "month" | "year", anchor: string, dateExpr: string, offsetMinutes: number) {
  const period = periodPredicate(scope, anchor, dateExpr);
  const bounds = periodBounds(scope, anchor, offsetMinutes);
  return {
    sql: `t.occurred_at>=? AND t.occurred_at<? AND ${period.sql}`,
    params: [bounds.from, bounds.to, period.value],
  };
}

async function periodSummary(db: ReturnType<typeof getDbBinding>, ledgerId: number, scope: "day" | "month" | "year", anchor: string, dateExpr: string, offsetMinutes: number): Promise<PeriodSummary> {
  const period = periodClause(scope, anchor, dateExpr, offsetMinutes);
  const rows = await db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN t.type='收入' THEN t.amount*${RATE_SQL} ELSE 0 END),0) income,
      COALESCE(SUM(CASE WHEN t.type='支出' THEN t.amount*${RATE_SQL} ELSE 0 END),0) expense,
      COUNT(*) count
    FROM transactions t
    WHERE t.ledger_id=? AND ${period.sql}
  `).bind(ledgerId, ...period.params).first<{ income: number; expense: number; count: number }>();
  const top = await db.prepare(`
    SELECT COALESCE(t.category_dynamic,t.category,'未分类') name,
      COALESCE(SUM(t.amount*${RATE_SQL}),0) amount
    FROM transactions t
    WHERE t.ledger_id=? AND t.type='支出' AND ${period.sql}
    GROUP BY COALESCE(t.category_dynamic,t.category,'未分类')
    ORDER BY amount DESC, name ASC LIMIT 1
  `).bind(ledgerId, ...period.params).first<{ name: string; amount: number }>();
  const income = Number(rows?.income ?? 0);
  const expense = Number(rows?.expense ?? 0);
  return {
    income,
    expense,
    balance: income - expense,
    count: Number(rows?.count ?? 0),
    topCategory: top?.name ?? null,
    topCategoryAmount: Number(top?.amount ?? 0),
  };
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取流水摘要失败", async () => {
    await ensureDb();
    const url = new URL(request.url);
    const ledgerId = Number(url.searchParams.get("ledger"));
    await claimAndRequireLedger(request, ledgerId);
    const todayKey = url.searchParams.get("today") || "";
    const dimension = url.searchParams.get("dimension") || "月";
    if (!validDateKey(todayKey)) throw new Error("today 格式无效");
    if (!DIMENSIONS.has(dimension)) throw new Error("dimension 无效");
    const rawOffset = Number(url.searchParams.get("offset") || 0);
    if (!Number.isInteger(rawOffset) || rawOffset < -840 || rawOffset > 840) throw new Error("offset 无效");
    const offsetModifier = `${rawOffset >= 0 ? "+" : ""}${rawOffset} minutes`;
    const dateExpr = `datetime(t.occurred_at,'${offsetModifier}')`;
    const db = getDbBinding();
    const scope = dimension === "日" ? "day" : dimension === "月" ? "month" : "year";
    const dateFilter = periodClause(scope, todayKey, dateExpr, rawOffset);
    const datePredicate = dateFilter.sql;
    const base = await db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN t.type='支出' THEN t.amount*${RATE_SQL} ELSE 0 END),0) expense,
        COALESCE(SUM(CASE WHEN t.type='收入' THEN t.amount*${RATE_SQL} ELSE 0 END),0) income
      FROM transactions t WHERE t.ledger_id=? AND ${datePredicate}
    `).bind(ledgerId, ...dateFilter.params).first<{ expense: number; income: number }>();
    const categories = await db.prepare("SELECT name FROM expense_categories WHERE ledger_id=? ORDER BY sort_order,id LIMIT 200").bind(ledgerId).all<{ name: string }>();
    const incomeCategories = await db.prepare("SELECT name FROM income_categories WHERE ledger_id=? ORDER BY sort_order,id LIMIT 200").bind(ledgerId).all<{ name: string }>();
    const categoryNames = categories.results.map((row) => row.name);
    const incomeCategoryNames = incomeCategories.results.map((row) => row.name);
    const categoryRows = categoryNames.length
      ? await db.prepare(`
          SELECT COALESCE(t.category_dynamic,t.category,'未分类') name, COALESCE(SUM(t.amount*${RATE_SQL}),0) amount
          FROM transactions t
          WHERE t.ledger_id=? AND t.type='支出' AND ${datePredicate}
            AND COALESCE(t.category_dynamic,t.category,'未分类') IN (${categoryNames.map(() => "?").join(",")})
          GROUP BY COALESCE(t.category_dynamic,t.category,'未分类')
        `).bind(ledgerId, ...dateFilter.params, ...categoryNames).all<SummaryRow>()
      : { results: [] as SummaryRow[] };
    const moodRows = await db.prepare(`
      SELECT COALESCE(t.mood,'未标记') name, COALESCE(SUM(t.amount*${RATE_SQL}),0) amount
      FROM transactions t WHERE t.ledger_id=? AND t.type='支出' AND ${datePredicate}
      GROUP BY COALESCE(t.mood,'未标记')
    `).bind(ledgerId, ...dateFilter.params).all<SummaryRow>();
    const incomeRows = incomeCategoryNames.length
      ? await db.prepare(`
          SELECT COALESCE(t.income_category_dynamic,t.income_category,'其它收入') name, COALESCE(SUM(t.amount*${RATE_SQL}),0) amount
          FROM transactions t
          WHERE t.ledger_id=? AND t.type='收入' AND ${datePredicate}
            AND COALESCE(t.income_category_dynamic,t.income_category,'其它收入') IN (${incomeCategoryNames.map(() => "?").join(",")})
          GROUP BY COALESCE(t.income_category_dynamic,t.income_category,'其它收入')
        `).bind(ledgerId, ...dateFilter.params, ...incomeCategoryNames).all<SummaryRow>()
      : { results: [] as SummaryRow[] };
    const trendGroup = dimension === "年"
      ? `strftime('%m',${dateExpr})`
      : dimension === "月"
        ? `strftime('%d',${dateExpr})`
        : `strftime('%H',${dateExpr})`;
    const trendLabel = dimension === "年"
      ? `printf('%d月',CAST(strftime('%m',${dateExpr}) AS INTEGER))`
      : dimension === "月"
        ? `printf('%d日',CAST(strftime('%d',${dateExpr}) AS INTEGER))`
        : `strftime('%H:00',${dateExpr})`;
    const trend = await db.prepare(`
      SELECT ${trendLabel} label,
        COALESCE(SUM(CASE WHEN t.type='支出' THEN t.amount*${RATE_SQL} ELSE 0 END),0) expense,
        COALESCE(SUM(CASE WHEN t.type='收入' THEN t.amount*${RATE_SQL} ELSE 0 END),0) income
      FROM transactions t WHERE t.ledger_id=? AND ${datePredicate}
      GROUP BY ${trendGroup} ORDER BY ${trendGroup}
    `).bind(ledgerId, ...dateFilter.params).all<{ label: string; expense: number; income: number }>();
    const moods = ["悦己", "刚需", "冲动"];
    const byName = (rows: SummaryRow[], names: string[]) => names.map((name) => ({ name, amount: Number(rows.find((row) => row.name === name)?.amount ?? 0) }));
    const expenseTotal = Number(base?.expense ?? 0);
    const incomeTotal = Number(base?.income ?? 0);
    const categoryData = byName(categoryRows.results, categories.results.map((row) => row.name));
    const moodData = byName(moodRows.results, moods);
    const incomeData = byName(incomeRows.results, incomeCategories.results.map((row) => row.name));
    const topCategory = [...categoryData].sort((a, b) => b.amount - a.amount)[0] ?? null;
    const nightDate = new Date(`${todayKey}T12:00:00Z`);
    const nowParam = url.searchParams.get("now");
    const now = nowParam ? new Date(nowParam) : new Date();
    if (Number.isNaN(now.getTime())) throw new Error("now 格式无效");
    const rawHour = url.searchParams.get("hour");
    const localHour = rawHour === null ? now.getUTCHours() : Number(rawHour);
    if (!Number.isInteger(localHour) || localHour < 0 || localHour > 23) throw new Error("hour 无效");
    if (localHour < 5) nightDate.setUTCDate(nightDate.getUTCDate() - 1);
    const nightDateKey = nightDate.toISOString().slice(0, 10);
    const tomorrow = new Date(`${nightDateKey}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const analysis = {
      expenseTotal, incomeTotal, balance: incomeTotal - expenseTotal,
      savingRate: incomeTotal ? ((incomeTotal - expenseTotal) / incomeTotal) * 100 : 0,
      categoryData, moodData, incomeData,
      trend: trend.results.map((row) => ({ label: row.label, expense: Number(row.expense), income: Number(row.income) })),
      impulse: moodData.find((row) => row.name === "冲动")?.amount ?? 0,
      topCategory,
      needExpense: moodData.find((row) => row.name === "刚需")?.amount ?? 0,
      investmentIncome: incomeData.find((row) => row.name === "理财收益")?.amount ?? 0,
    };
    const [daily, nightDaily, nightMonthly, nightYearly] = await Promise.all([
      periodSummary(db, ledgerId, "day", todayKey, dateExpr, rawOffset),
      periodSummary(db, ledgerId, "day", nightDateKey, dateExpr, rawOffset),
      periodSummary(db, ledgerId, "month", nightDateKey, dateExpr, rawOffset),
      periodSummary(db, ledgerId, "year", nightDateKey, dateExpr, rawOffset),
    ]);
    const currentMonth = await periodSummary(db, ledgerId, "month", todayKey, dateExpr, rawOffset);
    const monthFilter = periodClause("month", todayKey, dateExpr, rawOffset);
    const sideIncome = await db.prepare(`
      SELECT COALESCE(SUM(t.amount*${RATE_SQL}),0) amount
      FROM transactions t
      WHERE t.ledger_id=? AND t.type='收入' AND t.is_side_hustle=1 AND ${monthFilter.sql}
    `).bind(ledgerId, ...monthFilter.params).first<{ amount: number }>();
    const sideCost = await db.prepare(`
      SELECT COALESCE(SUM(d.amount*(CASE t.currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN 0.0462 WHEN 'EUR' THEN 7.85 ELSE 1 END)),0) amount
      FROM side_hustle_deductions d JOIN transactions t ON t.id=d.transaction_id
      WHERE d.ledger_id=? AND ${monthFilter.sql}
    `).bind(ledgerId, ...monthFilter.params).first<{ amount: number }>();
    const categorySpendRows = await db.prepare(`
      SELECT COALESCE(t.category_dynamic,t.category,'未分类') name, COALESCE(SUM(t.amount*${RATE_SQL}),0) amount
      FROM transactions t
      WHERE t.ledger_id=? AND t.type='支出' AND ${monthFilter.sql}
      GROUP BY COALESCE(t.category_dynamic,t.category,'未分类')
      ORDER BY amount DESC
      LIMIT 200
    `).bind(ledgerId, ...monthFilter.params).all<SummaryRow>();
    const recentKeys: string[] = [];
    const recentAnchor = new Date(`${todayKey}T12:00:00Z`);
    for (let offset = 0; offset < 3; offset += 1) {
      const date = new Date(recentAnchor);
      date.setUTCDate(date.getUTCDate() - offset);
      recentKeys.push(date.toISOString().slice(0, 10));
    }
    const impulseRows = await db.prepare(`
      SELECT DISTINCT date(${dateExpr}) day
      FROM transactions t
      WHERE t.ledger_id=? AND t.type='支出' AND t.mood='冲动' AND date(${dateExpr}) IN (${recentKeys.map(() => "?").join(",")})
    `).bind(ledgerId, ...recentKeys).all<{ day: string }>();
    const settlementRows = await db.prepare(`
      SELECT t.split_with_member_id memberId,
        COALESCE(SUM(CASE
          WHEN t.split_mode='全额由我支付' THEN t.amount*${RATE_SQL}
          WHEN t.split_mode='全额由对方支付' THEN -t.amount*${RATE_SQL}
          WHEN t.split_mode='按比例平摊' THEN ROUND((t.amount*${RATE_SQL}*(100-t.my_share_percent))/100.0)
          WHEN t.split_mode='人情平账' AND t.my_share_percent=0 THEN -t.amount*${RATE_SQL}
          WHEN t.split_mode='人情平账' THEN t.amount*${RATE_SQL}
          ELSE 0 END),0) balance
      FROM transactions t
      WHERE t.ledger_id=? AND t.split_with_member_id IS NOT NULL
      GROUP BY t.split_with_member_id
      ORDER BY ABS(balance) DESC
      LIMIT 200
    `).bind(ledgerId).all<{ memberId: number; balance: number }>();
    const dashboard = {
      monthIncome: currentMonth.income,
      monthExpense: currentMonth.expense,
      sideIncome: Number(sideIncome?.amount ?? 0),
      sideCost: Number(sideCost?.amount ?? 0),
      categorySpend: categorySpendRows.results.map((row) => ({ name: row.name, amount: Number(row.amount) })),
      impulseDates: impulseRows.results.map((row) => row.day),
      settlements: settlementRows.results.map((row) => ({ memberId: Number(row.memberId), balance: Number(row.balance) })),
    };
    const years = await db.prepare(`SELECT DISTINCT strftime('%Y',${dateExpr}) year FROM transactions t WHERE t.ledger_id=? ORDER BY year DESC LIMIT 200`).bind(ledgerId).all<{ year: string }>();
    return privateJson({
      rates: FX_TO_CNY,
      todayKey,
      dimension,
      analysis,
      dashboard,
      periodReports: { daily, nightDaily, nightMonthly, nightYearly, nightDateKey, isMonthEnd: tomorrow.getUTCMonth() !== nightDate.getUTCMonth(), isYearEnd: tomorrow.getUTCFullYear() !== nightDate.getUTCFullYear() },
      availableYears: years.results.map((row) => Number(row.year)).filter(Number.isFinite),
    });
  });
}
