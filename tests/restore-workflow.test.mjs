import assert from "node:assert/strict";
import test from "node:test";
import {
  restorePreflightDetails,
  runRestoreBackupWorkflow,
  runRestoreSnapshotWorkflow,
} from "../app/restore-workflow.ts";

const checksum = "a".repeat(64);
const summary = { planChecksum: checksum, totalRecords: 12, estimatedStatements: 48 };
const okResponse = { response: new Response(null, { status: 200 }), data: { summary } };

test("restore preflight details reject missing or malformed fingerprints", () => {
  assert.equal(restorePreflightDetails(null), null);
  assert.equal(restorePreflightDetails({ planChecksum: "bad" }), null);
  assert.match(restorePreflightDetails(summary)?.message ?? "", /12.*48/u);
});

test("backup restore workflow preflights before confirmation and binds execution", async () => {
  const calls = [];
  const restore = async (input) => {
    calls.push(input);
    return input.dryRun ? okResponse : { response: new Response(null, { status: 200 }), data: { ok: true } };
  };
  const confirmed = [];
  const result = await runRestoreBackupWorkflow({
    file: new File(["backup"], "backup.json"),
    restore,
    confirm: async (details) => {
      confirmed.push(details.message);
      return true;
    },
  });
  assert.equal(result.cancelled, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].dryRun, true);
  assert.equal(calls[1].planChecksum, checksum);
  assert.equal(confirmed.length, 1);
});

test("backup restore cancellation never performs a destructive request", async () => {
  const calls = [];
  const result = await runRestoreBackupWorkflow({
    file: new File(["backup"], "backup.json"),
    restore: async (input) => {
      calls.push(input);
      return okResponse;
    },
    confirm: async () => false,
  });
  assert.equal(result.cancelled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].dryRun, true);
});

test("snapshot restore workflow refuses to execute after failed preflight", async () => {
  let confirmed = false;
  let calls = 0;
  await assert.rejects(
    () =>
      runRestoreSnapshotWorkflow({
        snapshotId: "snapshot-1",
        restore: async () => {
          calls += 1;
          return { response: new Response(null, { status: 409 }), data: { error: "快照校验失败" } };
        },
        confirm: async () => {
          confirmed = true;
          return true;
        },
      }),
    /快照校验失败/u,
  );
  assert.equal(calls, 1);
  assert.equal(confirmed, false);
});
