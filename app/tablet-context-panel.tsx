"use client";

import type { ModuleTab } from "./mobile-bottom-nav";

type LedgerItem = {
  name: string;
  icon: string;
};

type TabletContextPanelProps = {
  currentTab: ModuleTab;
  currentLedger: LedgerItem | undefined;
  transactionTotal: number;
  accountCount: number;
  pendingCount: number;
  offlineCount: number;
  isOnline: boolean;
  hasUnreadNotice: boolean;
  onOpenEntry: () => void;
  onOpenDataCenter: () => void;
  onOpenNotifications: () => void;
};

const moduleMeta: Record<ModuleTab, { eyebrow: string; title: string; hint: string }> = {
  dashboard: {
    eyebrow: "HOME CONTEXT",
    title: "主界面",
    hint: "查看今日财报、预算进度与最近动态。",
  },
  assets: {
    eyebrow: "WEALTH CONTEXT",
    title: "个人资产",
    hint: "管理账户、资产卡包与负债风险。",
  },
  bills: {
    eyebrow: "BILLS CONTEXT",
    title: "个人账单",
    hint: "筛选流水、处理同步队列并完成对账。",
  },
  planning: {
    eyebrow: "PLAN CONTEXT",
    title: "管理规划",
    hint: "查看预算、订阅、分期与长期目标。",
  },
  analytics: {
    eyebrow: "INSIGHT CONTEXT",
    title: "统计分析",
    hint: "从趋势、分类与预测中发现消费规律。",
  },
};

export function TabletContextPanel({
  currentTab,
  currentLedger,
  transactionTotal,
  accountCount,
  pendingCount,
  offlineCount,
  isOnline,
  hasUnreadNotice,
  onOpenEntry,
  onOpenDataCenter,
  onOpenNotifications,
}: TabletContextPanelProps) {
  const meta = moduleMeta[currentTab];
  const syncLabel = !isOnline
    ? "离线记录中"
    : offlineCount > 0
      ? `${offlineCount} 笔待同步`
      : "已同步";

  return (
    <aside className="tablet-context-panel" aria-label="平板实时上下文">
      <header className="tablet-context-header">
        <div>
          <p className="eyebrow">{meta.eyebrow}</p>
          <h3>{meta.title}</h3>
        </div>
        <span
          className={`tablet-sync-status ${isOnline && offlineCount === 0 ? "is-online" : "is-pending"}`}
          aria-live="polite"
        >
          <i aria-hidden="true" />
          {syncLabel}
        </span>
      </header>

      <div className="tablet-context-ledger">
        <span className="tablet-context-ledger-icon" aria-hidden="true">
          {currentLedger?.icon ?? "📚"}
        </span>
        <div>
          <span className="tablet-context-label">当前账本</span>
          <strong>{currentLedger?.name ?? "我的账本"}</strong>
        </div>
      </div>

      <p className="tablet-context-hint">{meta.hint}</p>

      <div className="tablet-context-metrics" aria-label="账本概览">
        <div>
          <span>流水</span>
          <strong>{transactionTotal}</strong>
        </div>
        <div>
          <span>账户</span>
          <strong>{accountCount}</strong>
        </div>
        <div>
          <span>待发送</span>
          <strong className={pendingCount > 0 ? "is-alert" : undefined}>{pendingCount}</strong>
        </div>
      </div>

      <div className="tablet-context-actions">
        <button type="button" className="tablet-context-primary" onClick={onOpenEntry}>
          <span aria-hidden="true">＋</span>
          记一笔
        </button>
        <button type="button" onClick={onOpenDataCenter}>
          💾 数据中心
        </button>
        <button type="button" className={hasUnreadNotice ? "has-alert" : undefined} onClick={onOpenNotifications}>
          🔔 通知与待办
          {hasUnreadNotice && <i aria-label="有未读通知" />}
        </button>
      </div>
    </aside>
  );
}
