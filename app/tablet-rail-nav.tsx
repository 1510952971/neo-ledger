"use client";

import React from "react";
import Image from "next/image";
import type { ModuleTab } from "./mobile-bottom-nav";
import type { ClientAuthUser } from "./auth-panel.tsx";

type LedgerItem = {
  id: number;
  name: string;
  icon: string;
};

type TabletRailNavProps = {
  currentTab: ModuleTab;
  onSelectTab: (tab: ModuleTab) => void;
  onOpenEntry: () => void;
  currentLedger: LedgerItem | undefined;
  onOpenLedgerMenu: () => void;
  onOpenDataCenter: () => void;
  onOpenNotifications: () => void;
  onOpenAesthetic: () => void;
  onOpenAuth: () => void;
  hasUnreadNotice?: boolean;
  currentUser: ClientAuthUser | null;
};

const navItems: { tab: ModuleTab; label: string; icon: string }[] = [
  { tab: "dashboard", label: "主页", icon: "🏠" },
  { tab: "assets", label: "资产", icon: "💎" },
  { tab: "bills", label: "账单", icon: "🧾" },
  { tab: "planning", label: "规划", icon: "🗓️" },
  { tab: "analytics", label: "分析", icon: "📊" },
];

export function TabletRailNav({
  currentTab,
  onSelectTab,
  onOpenEntry,
  currentLedger,
  onOpenLedgerMenu,
  onOpenDataCenter,
  onOpenNotifications,
  onOpenAesthetic,
  onOpenAuth,
  hasUnreadNotice = false,
  currentUser,
}: TabletRailNavProps) {
  return (
    <aside className="tablet-rail-nav" aria-label="平板导航轨">
      {/* 顶部：账本快捷切换与品牌 */}
      <div className="tablet-rail-top">
        <button
          type="button"
          className="tablet-rail-ledger"
          onClick={onOpenLedgerMenu}
          title={`当前账本: ${currentLedger?.name ?? "我的账本"}`}
          aria-label="切换账本"
        >
          <span className="ledger-emoji">{currentLedger?.icon ?? "📚"}</span>
        </button>
      </div>

      {/* 中部：5大核心模块导航 */}
      <nav className="tablet-rail-modules" aria-label="核心财务模块">
        {navItems.map((item) => (
          <button
            key={item.tab}
            type="button"
            className={`tablet-rail-item ${currentTab === item.tab ? "active" : ""}`}
            onClick={() => onSelectTab(item.tab)}
            title={item.label}
            aria-label={item.label}
            aria-current={currentTab === item.tab ? "page" : undefined}
          >
            <span className="tablet-rail-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="tablet-rail-label">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* 记一笔快捷按钮 */}
      <div className="tablet-rail-fab">
        <button
          type="button"
          className="tablet-fab-btn"
          onClick={onOpenEntry}
          title="记一笔 (Cmd+N)"
          aria-label="记一笔"
        >
          <span>＋</span>
        </button>
      </div>

      {/* 底部：控制中心与个人档案 */}
      <div className="tablet-rail-bottom">
        <button
          type="button"
          className="tablet-tool-btn"
          onClick={onOpenDataCenter}
          title="数据中心与云同步"
          aria-label="数据中心"
        >
          <span>💾</span>
        </button>

        <button
          type="button"
          className="tablet-tool-btn"
          onClick={onOpenNotifications}
          title="系统通知"
          aria-label="系统通知"
        >
          <span>🔔</span>
          {hasUnreadNotice && <i className="tablet-badge-dot" />}
        </button>

        <button
          type="button"
          className="tablet-tool-btn"
          onClick={onOpenAesthetic}
          title="换肤中心"
          aria-label="换肤中心"
        >
          <span>🎨</span>
        </button>

        <button
          type="button"
          className="tablet-avatar-btn"
          onClick={onOpenAuth}
          title={currentUser ? currentUser.username : "登录账号"}
          aria-label="账号与设置"
        >
          {currentUser?.avatarUrl ? (
            <Image
              src={currentUser.avatarUrl}
              alt=""
              width={30}
              height={30}
              unoptimized
              className="rounded-full"
            />
          ) : (
            <span>
              {currentUser?.displayName
                ? currentUser.displayName.slice(0, 1).toUpperCase()
                : "☺"}
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
