"use client";

import { useEffect, useEffectEvent } from "react";

type BadgeInput = { code: string; tier: string };
type AchievementInput = { code: string; unlockedAt: string };

export function selectDailyBadgeCode(input: {
  badges: BadgeInput[];
  achievements: AchievementInput[];
  tierRank: Record<string, number>;
}) {
  const unlocked = input.badges
    .filter((badge) => input.achievements.some((item) => item.code === badge.code))
    .sort((a, b) => {
      const tierDifference = (input.tierRank[b.tier] ?? 0) - (input.tierRank[a.tier] ?? 0);
      if (tierDifference) return tierDifference;
      const unlockedAt = (code: string) => input.achievements.find((item) => item.code === code)?.unlockedAt ?? "";
      return unlockedAt(b.code).localeCompare(unlockedAt(a.code));
    });
  return unlocked[0]?.code ?? null;
}

export function useAchievementBadgeLifecycle(input: {
  active: boolean;
  todayKey: string;
  ledgerId: number;
  locked: boolean;
  badges: BadgeInput[];
  achievements: AchievementInput[];
  tierRank: Record<string, number>;
  setFocusCode: (code: string) => void;
  openBadge: () => void;
}) {
  const {
    active,
    todayKey,
    ledgerId,
    locked,
    badges,
    achievements,
    tierRank,
    setFocusCode: setFocusCodeTask,
    openBadge: openBadgeTask,
  } = input;
  const setFocusCode = useEffectEvent(setFocusCodeTask);
  const openBadge = useEffectEvent(openBadgeTask);

  useEffect(() => {
    if (!active || !todayKey || locked) return;
    const code = selectDailyBadgeCode({ badges, achievements, tierRank });
    if (!code) return;

    const key = `neo-badges-daily-v2-${ledgerId}`;
    try {
      if (localStorage.getItem(key) === todayKey) return;
      localStorage.setItem(key, todayKey);
    } catch {
      // Private browsing/storage policy must not prevent the badge dialog.
    }

    const frame = window.requestAnimationFrame(() => {
      setFocusCode(code);
      openBadge();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, todayKey, ledgerId, locked, badges, achievements, tierRank]);
}
