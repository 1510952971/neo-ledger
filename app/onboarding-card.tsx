"use client";

export type OnboardingCardProps = {
  accountCount: number;
  hasTransactions: boolean;
  onOpenEntry: () => void;
  onOpenImport: () => void;
  onDismiss: () => void;
};

export function OnboardingCard({
  accountCount,
  hasTransactions,
  onOpenEntry,
  onOpenImport,
  onDismiss,
}: OnboardingCardProps) {
  if (hasTransactions) return null;
  const accountReady = accountCount > 1;
  return (
    <section className="onboarding-card" aria-labelledby="onboarding-title">
      <div className="onboarding-card-copy">
        <p className="eyebrow">WELCOME TO NEO LEDGER</p>
        <h2 id="onboarding-title">先把第一笔钱放进来</h2>
        <p>不会自动写入演示数据。你可以从默认现金账户开始，也可以先添加真实账户或导入历史账单。</p>
      </div>
      <ol className="onboarding-steps" aria-label="首次使用步骤">
        <li className={accountReady ? "complete" : "current"}>
          <span aria-hidden="true">{accountReady ? "✓" : "1"}</span>
          <div><strong>准备账户</strong><small>{accountReady ? "已添加多个账户" : "默认现金账户已就绪"}</small></div>
        </li>
        <li className="current"><span aria-hidden="true">2</span><div><strong>记录或导入</strong><small>记一笔，或批量导入历史账单</small></div></li>
        <li><span aria-hidden="true">3</span><div><strong>查看分析</strong><small>有数据后自动生成趋势和预算洞察</small></div></li>
      </ol>
      <div className="onboarding-actions">
        <button type="button" className="primary-button" onClick={onOpenEntry}>记第一笔</button>
        <button type="button" className="secondary-button" onClick={onOpenImport}>导入账单</button>
        <button type="button" className="text-button" onClick={onDismiss}>稍后再说</button>
      </div>
    </section>
  );
}
