export const SPLIT_MODES = new Set([
  "全额由我支付",
  "全额由对方支付",
  "按比例平摊",
]);

export function isSplitMode(value) {
  return SPLIT_MODES.has(String(value || ""));
}

/**
 * @param {string} type
 * @param {number} amount
 * @param {string | null} [splitMode]
 * @param {number} [splitWithMemberId]
 */
export function transactionAccountDelta(
  type,
  amount,
  splitMode = null,
  splitWithMemberId = 0,
) {
  if (type === "收入") return amount;
  if (
    Number(splitWithMemberId) > 0 &&
    splitMode === "全额由对方支付"
  )
    return 0;
  return -amount;
}

export function splitBalanceDelta(amount, splitMode, mySharePercent = 100) {
  if (splitMode === "全额由我支付") return amount;
  if (splitMode === "全额由对方支付") return -amount;
  if (splitMode === "按比例平摊")
    return Math.round((amount * (100 - mySharePercent)) / 100);
  if (splitMode === "人情平账")
    return mySharePercent === 0 ? -amount : amount;
  return 0;
}
