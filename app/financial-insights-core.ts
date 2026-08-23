type InsightAccount = {
  type: "资产" | "负债";
  currentBalance: number;
  initialBalance: number;
  currency: string;
  assetClass: "现金流" | "固收防守" | "风险进攻";
  isInvestment: boolean;
};

type InsightTransaction = {
  id: number;
  amount: number;
  type: "收入" | "支出";
  currency: string;
  occurredAt: string;
  isSideHustle: boolean;
};

type InsightDeduction = { transactionId: number; amount: number };

type InsightForecast = {
  hasSpendingData?: boolean;
  averageDailySpend?: number;
  monthlyFixed?: number;
};

type InsightSummary = {
  dashboard?: {
    monthIncome?: number;
    monthExpense?: number;
    sideIncome?: number;
    sideCost?: number;
  };
};

type InsightStressEvents = {
  unemployment: boolean;
  crash: boolean;
  emergency: boolean;
};

export type FinancialInsights = {
  assetTotal: number;
  liabilityTotal: number;
  allocation: Array<{ name: InsightAccount["assetClass"]; amount: number }>;
  allocationTotal: number;
  cashRatio: number;
  debtRatio: number;
  netWorthCny: number;
  fireTarget: number;
  fireProgress: number;
  inflationRate: number;
  realNetWorthOneYear: number;
  savingRateCny: number;
  growthRate: number;
  rank: string;
  investmentAssets: number;
  emergencyLoss: number;
  marketLoss: number;
  stressedNet: number;
  dailyBurn: number;
  stressRunway: number | null;
  liquidAssets: number;
  resilienceScore: number;
  sideIncomeCny: number;
  sideCostCny: number;
  sideProfit: number;
  estimatedTax: number;
};

function toUtcDate(value: string) {
  return new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
}

export function laborTax(grossCents: number) {
  const gross = grossCents / 100;
  if (gross <= 800) return 0;
  const taxable = gross <= 4000 ? gross - 800 : gross * 0.8;
  const tax =
    taxable <= 20000
      ? taxable * 0.2
      : taxable <= 50000
        ? taxable * 0.3 - 2000
        : taxable * 0.4 - 7000;
  return Math.max(0, Math.round(tax * 100));
}

export function buildFinancialInsights(input: {
  accountList: InsightAccount[];
  transactions: InsightTransaction[];
  deductions: InsightDeduction[];
  exchangeRates: Record<string, number>;
  assetTotal: number;
  fireConfig: { monthlyExpense: number };
  inflationConfig: { inflationBps: number };
  stressEvents: InsightStressEvents;
  forecast: InsightForecast | null | undefined;
  serverSummary: InsightSummary | null | undefined;
  transactionsTruncated: boolean;
  todayKey: string;
}): FinancialInsights {
  const {
    accountList,
    transactions,
    deductions,
    exchangeRates,
    assetTotal,
    fireConfig,
    inflationConfig,
    stressEvents,
    forecast,
    serverSummary,
    transactionsTruncated,
    todayKey,
  } = input;
  const liabilityTotal = accountList
    .filter((item) => item.type === "负债")
    .reduce(
      (sum, item) => sum + Math.abs(item.currentBalance) * exchangeRates[item.currency],
      0,
    );
  const allocation = (["现金流", "固收防守", "风险进攻"] as const).map((name) => ({
    name,
    amount: accountList
      .filter((item) => item.type === "资产" && item.assetClass === name)
      .reduce(
        (sum, item) => sum + Math.max(0, item.currentBalance) * exchangeRates[item.currency],
        0,
      ),
  }));
  const allocationTotal = Math.max(1, allocation.reduce((sum, item) => sum + item.amount, 0));
  const cashRatio = (allocation.find((item) => item.name === "现金流")!.amount / allocationTotal) * 100;
  const debtRatio = (liabilityTotal / Math.max(1, assetTotal)) * 100;
  const netWorthCny = assetTotal - liabilityTotal;
  const fireTarget = fireConfig.monthlyExpense * 300;
  const fireProgress = Math.max(0, Math.min(100, (netWorthCny / Math.max(1, fireTarget)) * 100));
  const inflationRate = inflationConfig.inflationBps / 10000;
  const realNetWorthOneYear = netWorthCny / Math.pow(1 + inflationRate, 1);
  const currentMonthRows = transactions.filter((item) => {
    const date = toUtcDate(item.occurredAt);
    const anchor = new Date(`${todayKey}T12:00:00`);
    return (
      date.getFullYear() === anchor.getFullYear() &&
      date.getMonth() === anchor.getMonth()
    );
  });
  const monthIncomeCny = serverSummary?.dashboard?.monthIncome ?? (transactionsTruncated ? 0 : currentMonthRows
    .filter((item) => item.type === "收入")
    .reduce((sum, item) => sum + item.amount * exchangeRates[item.currency], 0));
  const monthExpenseCny = serverSummary?.dashboard?.monthExpense ?? (transactionsTruncated ? 0 : currentMonthRows
    .filter((item) => item.type === "支出")
    .reduce((sum, item) => sum + item.amount * exchangeRates[item.currency], 0));
  const savingRateCny = monthIncomeCny
    ? ((monthIncomeCny - monthExpenseCny) / monthIncomeCny) * 100
    : 0;
  const initialNet = accountList.reduce(
    (sum, item) => sum + (item.type === "资产" ? item.initialBalance : -Math.abs(item.initialBalance)) * exchangeRates[item.currency],
    0,
  );
  const growthRate = initialNet
    ? ((assetTotal - liabilityTotal - initialNet) / Math.abs(initialNet)) * 100
    : 0;
  const rank =
    savingRateCny >= 45 && growthRate >= 10
      ? "赛博财神爷"
      : savingRateCny >= 25
        ? "疯狂星期四黄金常客"
        : savingRateCny >= 10
          ? "奶茶自由白银选手"
          : "不名一文的青铜打工人";
  const investmentAssets = accountList
    .filter((item) => item.isInvestment)
    .reduce(
      (sum, item) => sum + Math.max(0, item.currentBalance) * exchangeRates[item.currency],
      0,
    );
  const emergencyLoss = stressEvents.emergency ? 3000000 : 0;
  const marketLoss = stressEvents.crash ? investmentAssets * 0.5 : 0;
  const stressedNet = Math.max(0, assetTotal - liabilityTotal - emergencyLoss - marketLoss);
  const dailyBurn =
    (forecast?.hasSpendingData ? forecast.averageDailySpend ?? 0 : 0) +
    (forecast?.monthlyFixed ?? 0) / 30.4375;
  const stressRunway = dailyBurn > 0 ? Math.max(0, Math.floor(stressedNet / dailyBurn)) : null;
  const liquidAssets = accountList
    .filter((item) => item.type === "资产" && !item.isInvestment)
    .reduce(
      (sum, item) => sum + Math.max(0, item.currentBalance) * exchangeRates[item.currency],
      0,
    ) - emergencyLoss;
  const resilienceScore = Math.max(
    0,
    Math.min(
      100,
      (stressRunway === null ? 0 : Math.round(stressRunway / 3.65)) -
        (stressEvents.crash ? 8 : 0) -
        (liquidAssets < 0 ? 18 : 0),
    ),
  );
  const sideIncomeCny = serverSummary?.dashboard?.sideIncome ?? (transactionsTruncated ? 0 : currentMonthRows
    .filter((item) => item.type === "收入" && item.isSideHustle)
    .reduce((sum, item) => sum + item.amount * exchangeRates[item.currency], 0));
  const sideCostCny = serverSummary?.dashboard?.sideCost ?? (transactionsTruncated ? 0 : deductions.reduce((sum, row) => {
    const tx = transactions.find((item) => item.id === row.transactionId);
    return sum + row.amount * (tx ? exchangeRates[tx.currency] : 1);
  }, 0));
  const sideProfit = Math.max(0, sideIncomeCny - sideCostCny);
  return {
    assetTotal,
    liabilityTotal,
    allocation,
    allocationTotal,
    cashRatio,
    debtRatio,
    netWorthCny,
    fireTarget,
    fireProgress,
    inflationRate,
    realNetWorthOneYear,
    savingRateCny,
    growthRate,
    rank,
    investmentAssets,
    emergencyLoss,
    marketLoss,
    stressedNet,
    dailyBurn,
    stressRunway,
    liquidAssets,
    resilienceScore,
    sideIncomeCny,
    sideCostCny,
    sideProfit,
    estimatedTax: laborTax(sideIncomeCny),
  };
}
