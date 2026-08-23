"use client";

import React from "react";
import Image from "next/image";
import type { ClientAuthUser } from "./auth-panel.tsx";

type LedgerItem = {
  id: number;
  name: string;
  icon: string;
};

type MobileHeaderProps = {
  currentLedger: LedgerItem | undefined;
  onOpenLedgerMenu: () => void;
  onOpenDataCenter: () => void;
  onOpenNotifications: () => void;
  onOpenAesthetic: () => void;
  onOpenAuth: () => void;
  hasUnreadNotifications?: boolean;
  currentUser: ClientAuthUser | null;
  isOnline?: boolean;
};

export function MobileHeader({
  currentLedger,
  onOpenLedgerMenu,
  onOpenDataCenter,
  onOpenNotifications,
  onOpenAesthetic,
  onOpenAuth,
  hasUnreadNotifications = false,
  currentUser,
  isOnline = true,
}: MobileHeaderProps) {
  return (
    <header className="mobile-top-header" aria-label="移动端顶部导航栏">
      <button
        type="button"
        className="mobile-ledger-trigger"
        onClick={onOpenLedgerMenu}
        aria-label="切换账本"
        title="点击切换账本"
      >
        <span className="ledger-icon" aria-hidden="true">
          {currentLedger?.icon ?? "📚"}
        </span>
        <strong className="ledger-name">
          {currentLedger?.name ?? "我的账本"}
        </strong>
        <span className="ledger-caret" aria-hidden="true">▾</span>
      </button>

      <div className="mobile-header-actions">
        {/* 数据中心与同步指示灯 */}
        <button
          type="button"
          className="mobile-icon-btn"
          onClick={onOpenDataCenter}
          aria-label="数据中心与云同步"
          title="数据中心"
        >
          <span>💾</span>
          {!isOnline && <i className="offline-pill-dot" title="当前离线" />}
        </button>

        {/* 系统通知 */}
        <button
          type="button"
          className="mobile-icon-btn"
          onClick={onOpenNotifications}
          aria-label="系统通知"
          title="系统通知"
        >
          <span>🔔</span>
          {hasUnreadNotifications && <i className="mobile-badge-dot" />}
        </button>

        {/* 换肤中心 */}
        <button
          type="button"
          className="mobile-icon-btn"
          onClick={onOpenAesthetic}
          aria-label="换肤中心"
          title="换肤中心"
        >
          <span>🎨</span>
        </button>

        {/* 用户头像与登录 */}
        <button
          type="button"
          className="mobile-avatar-btn"
          onClick={onOpenAuth}
          aria-label={
            currentUser ? `当前登录账号 ${currentUser.username}` : "登录账号"
          }
          title={currentUser ? currentUser.username : "登录账号"}
        >
          {currentUser?.avatarUrl ? (
            <Image
              src={currentUser.avatarUrl}
              alt=""
              width={28}
              height={28}
              unoptimized
              className="rounded-full object-cover"
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
    </header>
  );
}
