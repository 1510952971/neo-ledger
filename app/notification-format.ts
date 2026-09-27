export function humanizeNotificationMessage(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.includes("转出账户余额不足")) {
    return "自动还款未完成：转出账户余额不足，请先补充转出账户余额后重试。";
  }
  if (normalized.includes("SQLITE_CONSTRAINT") || normalized.includes("D1_ERROR")) {
    return "系统处理未完成：数据约束冲突，请稍后重试；如果重复出现，请联系管理员。";
  }
  return normalized || "系统通知暂无详细内容。";
}
