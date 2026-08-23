import assert from "node:assert/strict";
import test from "node:test";
import { selectDailyBadgeCode } from "../app/achievement-badge-lifecycle.ts";

test("成就提示优先选择稀有度更高且最近解锁的徽章", () => {
  const badges = [
    { code: "common", tier: "普通" },
    { code: "epic", tier: "史诗" },
    { code: "rare", tier: "稀有" },
  ];
  const achievements = [
    { code: "common", unlockedAt: "2026-08-19T10:00:00Z" },
    { code: "epic", unlockedAt: "2026-08-19T09:00:00Z" },
    { code: "rare", unlockedAt: "2026-08-19T11:00:00Z" },
  ];
  assert.equal(selectDailyBadgeCode({ badges, achievements, tierRank: { 普通: 1, 稀有: 2, 史诗: 3 } }), "epic");
  assert.equal(selectDailyBadgeCode({ badges: [], achievements, tierRank: {} }), null);
});
