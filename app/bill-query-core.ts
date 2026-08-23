export type BillRange = "all" | "day" | "week" | "month" | "year" | "custom";

export type BillQueryTransaction = {
  title: string;
  type: "支出" | "收入";
  category: string | null;
  incomeCategory: string | null;
  mood: string | null;
  currency: string;
  accountId: number;
  amount: number;
  occurredAt: string;
};

type ExchangeRates = Record<string, number>;

const toDate = (value: string) =>
  new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function queryBills<T extends BillQueryTransaction>(input: {
  transactions: T[];
  accounts: Array<{ id: number; name: string }>;
  anchorKey: string;
  query: string;
  range: BillRange;
  startDate?: string;
  endDate?: string;
  exchangeRates: ExchangeRates;
}) {
  const { transactions, anchorKey, range, exchangeRates } = input;
  const anchor = anchorKey ? new Date(`${anchorKey}T12:00:00`) : null;
  const accountNames = new Map(input.accounts.map((account) => [account.id, account.name]));
  const keyword = input.query.trim().toLocaleLowerCase("zh-CN");
  let weekStart: Date | null = null;
  let weekEnd: Date | null = null;
  if (anchor && range === "week") {
    weekStart = new Date(anchor);
    weekStart.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
  }
  const rows = transactions.filter((item) => {
    const date = toDate(item.occurredAt);
    const dateKey = localDateKey(date);
    let inRange = true;
    if (anchor && range === "day") inRange = dateKey === anchorKey;
    else if (anchor && range === "week")
      inRange = Boolean(weekStart && weekEnd && date >= weekStart && date < weekEnd);
    else if (anchor && range === "month")
      inRange = date.getFullYear() === anchor.getFullYear() && date.getMonth() === anchor.getMonth();
    else if (anchor && range === "year") inRange = date.getFullYear() === anchor.getFullYear();
    else if (range === "custom")
      inRange = (!input.startDate || dateKey >= input.startDate) && (!input.endDate || dateKey <= input.endDate);
    if (!inRange || !keyword) return inRange;
    const searchable = [
      item.title, item.type, item.category, item.incomeCategory, item.mood,
      item.currency, accountNames.get(item.accountId), (item.amount / 100).toFixed(2), dateKey,
    ].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
    return searchable.includes(keyword);
  });
  const income = rows.filter((item) => item.type === "收入")
    .reduce((sum, item) => sum + item.amount * (exchangeRates[item.currency] ?? 1), 0);
  const expense = rows.filter((item) => item.type === "支出")
    .reduce((sum, item) => sum + item.amount * (exchangeRates[item.currency] ?? 1), 0);
  return { rows, income, expense, balance: income - expense };
}
