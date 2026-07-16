export function toPositiveCents(value, message = "请输入正确金额") {
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error(message);
  return cents;
}

export function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function calculateGoalContribution({
  targetAmount,
  savedAmount,
  requestedAmount,
  accountBalance,
}) {
  const remainingAmount = Math.max(0, targetAmount - savedAmount);
  if (remainingAmount === 0) throw new Error("这个心愿已经完成啦");
  if (!Number.isSafeInteger(requestedAmount) || requestedAmount <= 0)
    throw new Error("请输入存入金额");

  const appliedAmount = Math.min(requestedAmount, remainingAmount);
  if (!Number.isSafeInteger(accountBalance) || accountBalance < appliedAmount)
    throw new Error("账户余额不足");

  return {
    appliedAmount,
    savedAmount: savedAmount + appliedAmount,
    remainingAmount: remainingAmount - appliedAmount,
    completed: appliedAmount === remainingAmount,
  };
}
