/** Run date-driven ledger jobs from the Worker cron trigger. */
export async function runScheduledLedgerJobs(jobs) {
  await jobs.ensureDb();
  // Process sequentially to avoid competing writes to D1 in one invocation.
  await jobs.processDueSubscriptions();
  await jobs.processDueRecurringTasks();
  await jobs.processDueInstallments();
  if (jobs.cleanupMobileIdempotency) await jobs.cleanupMobileIdempotency();
}
