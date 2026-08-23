export function subscriptionPresentation(item, todayKey) {
  const expiresAt = new Date(`${item.nextChargeDate}T00:00:00`);
  const daysLeft = todayKey ? Math.ceil((expiresAt.getTime() - new Date(`${todayKey}T00:00:00`).getTime()) / 86400000) : null;
  return {
    daysLeft,
    expiryStatus: daysLeft == null ? "正在计算" : daysLeft < 0 ? `已到期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? "今天到期" : daysLeft <= 30 ? `${daysLeft} 天后到期` : `${Math.ceil(daysLeft / 30)} 个月后到期`,
    dailyCost: item.amount / (item.cycle === "每月" ? 30 : item.cycle === "每季" ? 91 : 365),
    statusClass: daysLeft == null ? "" : daysLeft < 0 ? "expired" : daysLeft <= 7 ? "expiring" : "",
  };
}
