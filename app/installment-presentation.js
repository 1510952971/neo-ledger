export function installmentPresentation(item) {
  const periods = Math.max(1, Math.trunc(item.periods));
  const paidPeriods = Math.min(periods, Math.max(0, Math.trunc(item.paidPeriods)));
  const grandTotal = Math.max(0, Math.round(item.totalAmount + item.feeAmount));
  const paidAmount = Math.round((grandTotal * paidPeriods) / periods);
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(item.startMonth);
  const startIndex = match ? Number(match[1]) * 12 + Number(match[2]) - 1 : 0;
  const endIndex = startIndex + periods - 1;
  return {
    periods,
    paidPeriods,
    grandTotal,
    paidAmount,
    remainingAmount: grandTotal - paidAmount,
    percent: Math.round((paidPeriods / periods) * 100),
    endYear: Math.floor(endIndex / 12),
    endMonth: (endIndex % 12) + 1,
  };
}
