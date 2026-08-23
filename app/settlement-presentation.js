export function settlementPresentation(balance, memberName) {
  const normalized = Number.isFinite(balance) ? balance : 0;
  return {
    amount: Math.abs(normalized),
    className: normalized < 0 ? "owe" : "",
    message:
      normalized > 0
        ? `目前「${memberName}」应给你转账`
        : `你还欠「${memberName}」`,
  };
}
