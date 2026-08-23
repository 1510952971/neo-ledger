"use client";

import type { RefObject } from "react";
import {
  badgeDefinitions,
  badgeTierClass,
  badgeTierRank,
  type BadgeDefinition,
  type BadgeTier,
} from "./achievement-badge-data";

type AchievementBadgeDialogProps = {
  open: boolean;
  dialogRef: RefObject<HTMLDialogElement | null>;
  rank: string;
  achievements: ReadonlyArray<{ code: string }>;
  focusedBadge: BadgeDefinition | null;
  onClose: () => void;
  onClearFocus: () => void;
};

export function AchievementBadgeDialog({
  open,
  dialogRef,
  rank,
  achievements,
  focusedBadge,
  onClose,
  onClearFocus,
}: AchievementBadgeDialogProps) {
  return (
    open && (
      <dialog
        className="expense-dialog badge-dialog"
        ref={dialogRef}
        onCancel={onClose}
      >
        <div className="badge-wall">
          <div className="gold-particles">✦ · ✧ · ✦ · ✧</div>
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="关闭成就勋章墙"
          >
            ×
          </button>
          {focusedBadge ? (
            <>
              <p className="eyebrow">HIGHEST ACHIEVEMENT</p>
              <h2>今日最高成就</h2>
              <article
                className={`badge-showcase tier-${badgeTierClass[focusedBadge.tier]}`}
              >
                <em>{focusedBadge.tier}勋章</em>
                <span>{focusedBadge.icon}</span>
                <h3>{focusedBadge.name}</h3>
                <p>{focusedBadge.desc}</p>
                <b>已解锁 · 当前最高等级</b>
              </article>
              <button type="button" className="submit-button" onClick={onClearFocus}>
                查看完整勋章墙
              </button>
            </>
          ) : (
            <>
              <p className="eyebrow">ACHIEVEMENT COLLECTION</p>
              <h2>🎖️ 打工人自律勋章墙</h2>
              <p>
                当前段位：<strong>{rank}</strong> · 已解锁 {achievements.length}
                /{badgeDefinitions.length}
              </p>
              <div className="badge-tier-legend">
                {(Object.keys(badgeTierRank) as BadgeTier[]).map((tier) => (
                  <span className={`tier-${badgeTierClass[tier]}`} key={tier}>
                    {tier}
                  </span>
                ))}
              </div>
              <div className="badge-grid">
                {badgeDefinitions.map((badge) => {
                  const unlocked = achievements.some((item) => item.code === badge.code);
                  const concealed = badge.tier === "隐藏" && !unlocked;
                  return (
                    <article
                      className={`${unlocked ? "unlocked" : "locked"} tier-${badgeTierClass[badge.tier]}`}
                      key={badge.code}
                    >
                      <em>{badge.tier}</em>
                      <span>{unlocked ? badge.icon : concealed ? "❓" : "🔒"}</span>
                      <h3>{concealed ? "隐藏成就" : badge.name}</h3>
                      <p>{concealed ? "条件未知，静待命运触发" : badge.desc}</p>
                      <b>{unlocked ? "已点亮" : "继续解锁"}</b>
                    </article>
                  );
                })}
              </div>
              <button type="button" className="submit-button" onClick={onClose}>
                收下这份精神氮泵
              </button>
            </>
          )}
        </div>
      </dialog>
    )
  );
}

