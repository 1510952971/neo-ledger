"use client";

import type { PendingFlow } from "./notification-actions";

type PendingCategoryMeta = Record<string, { emoji: string }>;

type PendingTransactionSectionProps = {
  rows: PendingFlow[];
  total: number;
  categories: string[];
  categoryMeta: PendingCategoryMeta;
  formatCurrency: (amount: number, currency: PendingFlow["currency"]) => string;
  onRefresh: () => void | Promise<void>;
  onProcess: (
    id: number,
    category?: string,
    action?: "confirm" | "ignore",
  ) => void;
};

/** Presentation boundary for the pending-transaction triage queue. */
export function PendingTransactionSection({
  rows,
  total,
  categories,
  categoryMeta,
  formatCurrency,
  onRefresh,
  onProcess,
}: PendingTransactionSectionProps) {
  return (
    <div className="pending-shuffle">
      <div>
        <strong>待确认流水洗牌区</strong>
        <span>
          {total} 笔等待补全分类{total > rows.length ? `（显示最新 ${rows.length} 笔）` : ""}{" "}
          <button
            className="refresh-pending"
            onClick={() => void onRefresh()}
          >
            ↻ 刷新
          </button>
        </span>
      </div>
      {rows.length ? (
        rows.map((item) => (
          <article key={item.id}>
            <span>⚡</span>
            <div>
              <strong>{item.title}</strong>
              <small>
                {item.accountName} · {item.occurredAt.slice(0, 16)} ·{" "}
                {formatCurrency(item.amount / 100, item.currency)}
              </small>
              <p>{item.rawText}</p>
              {item.automationSuggestion && (
                <small className="automation-suggestion">
                  规则建议：{item.automationSuggestion.ruleName} · {item.automationSuggestion.reasons.join("、")}
                </small>
              )}
            </div>
            {item.automationSuggestion && (
              <button onClick={() => onProcess(item.id)}>应用规则建议</button>
            )}
            <select
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) onProcess(item.id, event.target.value);
              }}
            >
              <option value="" disabled>
                一键补全分类
              </option>
              {categories.map((name) => (
                <option value={name} key={name}>
                  {categoryMeta[name].emoji} {name}
                </option>
              ))}
            </select>
            <button onClick={() => onProcess(item.id, undefined, "ignore")}>
              忽略并回滚
            </button>
          </article>
        ))
      ) : (
        <p className="pipeline-empty">
          自动化雷达暂时安静。收到 Bark / 短信转发后，流水会在这里等待你轻点归类。
        </p>
      )}
    </div>
  );
}
