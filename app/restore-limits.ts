/**
 * D1 batches have a finite statement budget. Keep a margin below the
 * platform limit so a restore fails before any destructive statement runs.
 */
export const MAX_RESTORE_BATCH_STATEMENTS = 900;

const RESTORE_FIXED_STATEMENTS = 32;

export function estimateRestoreBatchStatements(data: Record<string, unknown>) {
  const arrays = Object.entries(data).filter(([, value]) => Array.isArray(value));
  let estimate =
    RESTORE_FIXED_STATEMENTS +
    arrays.reduce(
      (total, [, value]) => total + (value as unknown[]).length,
      0,
    );
  const ledgers = Array.isArray(data.ledgers) ? data.ledgers.length : 0;
  if (!Array.isArray(data.expenseCategories) || data.expenseCategories.length === 0)
    estimate += ledgers * 5;
  if (!Array.isArray(data.incomeCategories) || data.incomeCategories.length === 0)
    estimate += ledgers * 4;
  if (!Array.isArray(data.fireSettings) || data.fireSettings.length === 0)
    estimate += ledgers;
  if (!Array.isArray(data.economicSettings) || data.economicSettings.length === 0)
    estimate += ledgers;
  if (!Array.isArray(data.members) || data.members.length === 0)
    estimate += ledgers;
  return estimate;
}
