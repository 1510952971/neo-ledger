"use client";

import React from "react";

export type ModuleTab = "dashboard" | "assets" | "bills" | "planning" | "analytics";

type MobileBottomNavProps = {
  currentTab: ModuleTab;
  onSelectTab: (tab: ModuleTab) => void;
  onOpenEntry: () => void;
  hasUnreadNotice?: boolean;
  offlineCount?: number;
};

const navItems: { tab: ModuleTab; label: string; icon: string }[] = [
  { tab: "dashboard", label: "主页", icon: "🏠" },
  { tab: "assets", label: "资产", icon: "💎" },
  { tab: "bills", label: "账单", icon: "🧾" },
  { tab: "planning", label: "规划", icon: "🗓️" },
  { tab: "analytics", label: "分析", icon: "📊" },
];

export function MobileBottomNav({
  currentTab,
  onSelectTab,
  onOpenEntry,
  hasUnreadNotice = false,
  offlineCount = 0,
}: MobileBottomNavProps) {
  const handleTabClick = (tab: ModuleTab) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(8);
    }
    onSelectTab(tab);
  };

  const handleEntryClick = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(14);
    }
    onOpenEntry();
  };

  return (
    <nav className="mobile-bottom-bar" aria-label="移动端底部导航">
      <div className="mobile-tab-group">
        {navItems.slice(0, 2).map((item) => (
          <button
            key={item.tab}
            type="button"
            className={`mobile-tab-item ${currentTab === item.tab ? "active" : ""}`}
            onClick={() => handleTabClick(item.tab)}
            aria-current={currentTab === item.tab ? "page" : undefined}
          >
            <span className="mobile-tab-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="mobile-tab-label">{item.label}</span>
          </button>
        ))}
      </div>

      {/* 居中凸起 记一笔 FAB */}
      <div className="mobile-fab-slot">
        <button
          type="button"
          className="mobile-fab-button"
          onClick={handleEntryClick}
          aria-label="快速记一笔"
          title="记一笔"
        >
          <span className="mobile-fab-plus" aria-hidden="true">＋</span>
          {offlineCount > 0 && (
            <span className="mobile-fab-badge" title={`${offlineCount} 笔离线待同步`}>
              {offlineCount > 9 ? "9+" : offlineCount}
            </span>
          )}
        </button>
      </div>

      <div className="mobile-tab-group">
        {navItems.slice(2).map((item) => (
          <button
            key={item.tab}
            type="button"
            className={`mobile-tab-item ${currentTab === item.tab ? "active" : ""}`}
            onClick={() => handleTabClick(item.tab)}
            aria-current={currentTab === item.tab ? "page" : undefined}
          >
            <span className="mobile-tab-icon" aria-hidden="true">
              {item.icon}
              {item.tab === "bills" && hasUnreadNotice && (
                <i className="mobile-badge-dot" />
              )}
            </span>
            <span className="mobile-tab-label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
