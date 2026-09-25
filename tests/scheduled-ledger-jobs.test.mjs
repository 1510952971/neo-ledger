import test from "node:test";
import assert from "node:assert/strict";
import { runScheduledLedgerJobs } from "../app/scheduled-ledger-jobs.js";

test("scheduled ledger jobs initialize the database and process due work once in order", async () => {
  const calls = [];
  await runScheduledLedgerJobs(Object.fromEntries(
    ["ensureDb", "processDueSubscriptions", "processDueRecurringTasks", "processDueInstallments", "cleanupMobileIdempotency"]
      .map((name) => [name, async () => calls.push(name)]),
  ));
  assert.deepEqual(calls, [
    "ensureDb",
    "processDueSubscriptions",
    "processDueRecurringTasks",
    "processDueInstallments",
    "cleanupMobileIdempotency",
  ]);
});

test("scheduled ledger jobs stop and surface failures instead of silently marking the run successful", async () => {
  const calls = [];
  await assert.rejects(
    runScheduledLedgerJobs({
      ensureDb: async () => calls.push("ensureDb"),
      processDueSubscriptions: async () => {
        calls.push("processDueSubscriptions");
        throw new Error("D1 unavailable");
      },
      processDueRecurringTasks: async () => calls.push("processDueRecurringTasks"),
      processDueInstallments: async () => calls.push("processDueInstallments"),
      cleanupMobileIdempotency: async () => calls.push("cleanupMobileIdempotency"),
    }),
    /D1 unavailable/,
  );
  assert.deepEqual(calls, ["ensureDb", "processDueSubscriptions"]);
});
