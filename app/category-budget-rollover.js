function monthIndex(value) {
  const match = /^(\d{4})-(\d{2})$/u.exec(String(value ?? ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return year * 12 + month - 1;
}

function monthKey(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Carries only positive unspent allowance forward; monthly overspending resets. */
export function calculateBudgetCarryover({
  monthlyAmount,
  enabled,
  updatedMonth,
  currentMonth,
  spendingByMonth,
}) {
  if (!enabled || monthlyAmount <= 0) return 0;
  const start = monthIndex(updatedMonth);
  const end = monthIndex(currentMonth);
  if (start == null || end == null || start >= end) return 0;

  let carryover = 0;
  for (let month = start; month < end; month += 1) {
    const spent = Math.max(0, Number(spendingByMonth.get(monthKey(month)) ?? 0));
    carryover = Math.max(0, monthlyAmount + carryover - spent);
  }
  return Math.round(carryover);
}
