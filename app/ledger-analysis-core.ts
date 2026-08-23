export type AnalysisDimension = "日" | "月" | "年";

export type AnalysisTransaction = {
  amount: number;
  type: "支出" | "收入";
  currency: string;
  occurredAt: string;
  category: string | null;
  incomeCategory: string | null;
  mood: string | null;
};

type ExchangeRates = Record<string, number>;

const toDate = (value: string) =>
  new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));

const convertedAmount = <T extends AnalysisTransaction>(
  row: T,
  exchangeRates: ExchangeRates,
) => row.amount * (exchangeRates[row.currency] ?? 1);

export function buildLedgerAnalysis<T extends AnalysisTransaction>(input: {
  transactions: T[];
  dimension: AnalysisDimension;
  todayKey: string;
  exchangeRates: ExchangeRates;
  categoryNames: string[];
  incomeCategoryNames: string[];
  moods: string[];
}) {
  const { transactions, dimension, todayKey, exchangeRates } = input;
  const anchor = todayKey ? new Date(`${todayKey}T12:00:00`) : null;
  const filtered = transactions.filter((item) => {
    if (!anchor) return true;
    const date = toDate(item.occurredAt);
    if (dimension === "日")
      return date.getFullYear() === anchor.getFullYear() &&
        date.getMonth() === anchor.getMonth() &&
        date.getDate() === anchor.getDate();
    if (dimension === "月")
      return date.getFullYear() === anchor.getFullYear() &&
        date.getMonth() === anchor.getMonth();
    return date.getFullYear() === anchor.getFullYear();
  });
  const expenseRows = filtered.filter((item) => item.type === "支出");
  const incomeRows = filtered.filter((item) => item.type === "收入");
  const expenseTotal = expenseRows.reduce(
    (sum, item) => sum + convertedAmount(item, exchangeRates),
    0,
  );
  const incomeTotal = incomeRows.reduce(
    (sum, item) => sum + convertedAmount(item, exchangeRates),
    0,
  );
  const categoryData = input.categoryNames.map((name) => ({
    name,
    amount: expenseRows
      .filter((item) => item.category === name)
      .reduce((sum, item) => sum + convertedAmount(item, exchangeRates), 0),
  }));
  const moodData = input.moods.map((name) => ({
    name,
    amount: expenseRows
      .filter((item) => item.mood === name)
      .reduce((sum, item) => sum + convertedAmount(item, exchangeRates), 0),
  }));
  const incomeData = input.incomeCategoryNames.map((name) => ({
    name,
    amount: incomeRows
      .filter((item) => item.incomeCategory === name)
      .reduce((sum, item) => sum + convertedAmount(item, exchangeRates), 0),
  }));
  const buckets = new Map<string, { expense: number; income: number }>();
  [...filtered]
    .sort((a, b) => toDate(a.occurredAt).getTime() - toDate(b.occurredAt).getTime())
    .forEach((item) => {
      const date = toDate(item.occurredAt);
      const key = dimension === "年"
        ? `${date.getMonth() + 1}月`
        : dimension === "月"
          ? `${date.getDate()}日`
          : `${String(date.getHours()).padStart(2, "0")}:00`;
      const current = buckets.get(key) ?? { expense: 0, income: 0 };
      current[item.type === "支出" ? "expense" : "income"] += convertedAmount(item, exchangeRates);
      buckets.set(key, current);
    });
  const categoryTop = [...categoryData].sort((a, b) => b.amount - a.amount)[0];
  const balance = incomeTotal - expenseTotal;
  return {
    filtered,
    expenseTotal,
    incomeTotal,
    categoryData,
    moodData,
    incomeData,
    trend: [...buckets.entries()].map(([label, amounts]) => ({ label, ...amounts })),
    impulse: moodData.find((item) => item.name === "冲动")?.amount ?? 0,
    topCategory: categoryTop,
    needExpense: moodData.find((item) => item.name === "刚需")?.amount ?? 0,
    investmentIncome: incomeData.find((item) => item.name === "理财收益")?.amount ?? 0,
    balance,
    savingRate: incomeTotal ? (balance / incomeTotal) * 100 : 0,
  };
}

export type PeriodSummary = {
  income: number;
  expense: number;
  balance: number;
  count: number;
  topCategory: string | null;
  topCategoryAmount: number;
};

export function buildPeriodReports<T extends AnalysisTransaction>(input: {
  transactions: T[];
  todayKey: string;
  exchangeRates: ExchangeRates;
  nowMs?: number;
}) {
  const { transactions, todayKey, exchangeRates } = input;
  if (!todayKey) return null;
  const today = new Date(`${todayKey}T12:00:00`);
  const summarize = (scope: "day" | "month" | "year", anchor: Date): PeriodSummary => {
    const rows = transactions.filter((item) => {
      const date = toDate(item.occurredAt);
      if (date.getFullYear() !== anchor.getFullYear()) return false;
      if (scope === "year") return true;
      if (date.getMonth() !== anchor.getMonth()) return false;
      return scope === "month" || date.getDate() === anchor.getDate();
    });
    const income = rows
      .filter((item) => item.type === "收入")
      .reduce((sum, item) => sum + convertedAmount(item, exchangeRates), 0);
    const expenseRows = rows.filter((item) => item.type === "支出");
    const expense = expenseRows.reduce((sum, item) => sum + convertedAmount(item, exchangeRates), 0);
    const categoryTotals = new Map<string, number>();
    expenseRows.forEach((item) => {
      const name = item.category ?? "未分类";
      categoryTotals.set(name, (categoryTotals.get(name) ?? 0) + convertedAmount(item, exchangeRates));
    });
    const top = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])[0];
    return { income, expense, balance: income - expense, count: rows.length, topCategory: top?.[0] ?? null, topCategoryAmount: top?.[1] ?? 0 };
  };
  const now = new Date(input.nowMs ?? Date.now());
  const nightAnchor = new Date(today);
  if (now.getHours() < 5) nightAnchor.setDate(nightAnchor.getDate() - 1);
  const tomorrow = new Date(nightAnchor);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    daily: summarize("day", today),
    nightDaily: summarize("day", nightAnchor),
    nightMonthly: summarize("month", nightAnchor),
    nightYearly: summarize("year", nightAnchor),
    nightDateKey: `${nightAnchor.getFullYear()}-${String(nightAnchor.getMonth() + 1).padStart(2, "0")}-${String(nightAnchor.getDate()).padStart(2, "0")}`,
    isMonthEnd: tomorrow.getMonth() !== nightAnchor.getMonth(),
    isYearEnd: tomorrow.getFullYear() !== nightAnchor.getFullYear(),
  };
}
