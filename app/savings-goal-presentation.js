export function savingsGoalPresentation(goal, todayKey) {
  const percent = Math.min(100, Math.max(0, Math.round((goal.savedAmount / Math.max(1, goal.targetAmount)) * 100)));
  const deadline = new Date(`${goal.deadline}T00:00:00`);
  const today = new Date(`${todayKey}T00:00:00`);
  const daysLeft = todayKey && Number.isFinite(deadline.getTime()) ? Math.ceil((deadline.getTime() - today.getTime()) / 86400000) : null;
  return { percent, completed: percent >= 100, daysLeft, overdue: daysLeft != null && daysLeft < 0 };
}
