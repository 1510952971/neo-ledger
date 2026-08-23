export function categoryBudgetPresentation(spent, limit) {
  const safeSpent = Number.isFinite(spent) ? Math.max(0, spent) : 0;
  const safeLimit = Number.isFinite(limit) ? Math.max(0, limit) : 0;
  const ratio = safeLimit > 0 ? safeSpent / safeLimit : 0;
  return {
    ratio,
    percentage: safeLimit > 0 ? Math.round(ratio * 100) : null,
    progress: Math.min(100, Math.max(0, ratio * 100)),
    level: ratio >= 1 ? "danger" : ratio >= 0.8 ? "warning" : "safe",
  };
}
