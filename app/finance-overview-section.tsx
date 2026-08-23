"use client";

type FinanceOverviewSectionProps = {
  rank: string;
  assetTotal: number;
  liabilityTotal: number;
  financialAssetTotal: number;
  digitalAssetTotal: number;
  realNetWorthOneYear: number;
  inflationRate: number;
  budget: number;
  monthExpense: number;
  pending: boolean;
  formatMoney: (amount: number) => string;
  onOpenBadges: () => void;
  onOpenBudget: () => void;
  onSaveInflation: (formData: FormData) => void | Promise<void>;
};

/** Net-worth and budget cards share one stable presentation boundary. */
export function FinanceOverviewSection({
  rank,
  assetTotal,
  liabilityTotal,
  financialAssetTotal,
  digitalAssetTotal,
  realNetWorthOneYear,
  inflationRate,
  budget,
  monthExpense,
  pending,
  formatMoney,
  onOpenBadges,
  onOpenBudget,
  onSaveInflation,
}: FinanceOverviewSectionProps) {
  const budgetRatio = budget > 0 ? monthExpense / budget : 0;
  return (
    <>
      <article className="net-card module-assets">
        <div className="rank-ticker">
          🎖️ 当前段位 · {rank} <button onClick={onOpenBadges}>勋章墙</button>
        </div>
        <p>可用净资产</p>
        <strong>{formatMoney((assetTotal - liabilityTotal) / 100)}</strong>
        <div><span>总资产 {formatMoney(assetTotal / 100)}</span><span>待还负债 {formatMoney(liabilityTotal / 100)}</span></div>
        <div className="digital-worth-breakdown">
          <span>🏦 金融账户</span><b>{formatMoney(financialAssetTotal / 100)}</b>
          <span>⌁ 实物 / 虚拟资产</span><b>{formatMoney(digitalAssetTotal / 100)}</b>
        </div>
        <div className="real-worth">
          <span>📉 一年后真实购买力净资产</span>
          <b>{formatMoney(realNetWorthOneYear / 100)}</b>
          <small>按年化通胀率 {(inflationRate * 100).toFixed(1)}% 贴现</small>
        </div>
        <form action={onSaveInflation} className="inflation-setting">
          <label>预期年化通胀率 <input name="inflationRate" type="number" min="0" max="50" step="0.1" defaultValue={(inflationRate * 100).toFixed(1)} />%</label>
          <button disabled={pending}>校准</button>
        </form>
      </article>
      <article className="budget-mini-card module-planning">
        <div><p>本月预算</p><button onClick={onOpenBudget}>调整</button></div>
        <strong>{formatMoney(budget / 100)}</strong>
        <div className="progress-track"><div className="progress-value" style={{ width: `${Math.min(100, budgetRatio * 100)}%` }} /></div>
        <small>已使用 {formatMoney(monthExpense / 100)} · {Math.round(budgetRatio * 100)}%</small>
      </article>
    </>
  );
}
