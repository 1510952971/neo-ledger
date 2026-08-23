import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeRestoreSnapshots,
  parseSavedMergeReport,
  restoreSnapshotUrl,
} from "../app/data-center-restore-state.ts";

test("restore snapshot endpoint stays scoped to the data restore API", () => {
  assert.equal(restoreSnapshotUrl, "/api/data/restore");
});

test("saved merge reports reject malformed local storage values", () => {
  assert.equal(parseSavedMergeReport(null), null);
  assert.equal(parseSavedMergeReport("not-json"), null);
  assert.equal(parseSavedMergeReport(JSON.stringify({ conflictCount: 1 })), null);
});

test("saved merge reports preserve valid conflict metadata", () => {
  const report = {
    conflictCount: 1,
    truncated: 0,
    conflicts: [{
      table: "transactions",
      syncId: "tx-1",
      localTimestamp: "2026-01-01T00:00:00Z",
      remoteTimestamp: "2026-01-01T00:01:00Z",
      winner: "remote",
      local: { amount: 1 },
      remote: { amount: 2 },
      result: { amount: 2 },
    }],
  };
  assert.deepEqual(parseSavedMergeReport(JSON.stringify(report)), report);
});

test("restore snapshots discard malformed server rows", () => {
  assert.deepEqual(
    normalizeRestoreSnapshots([
      { id: "ok", createdAt: "2026-01-01", checksum: "abc", totalBytes: 12, chunkCount: 1 },
      { id: "bad", createdAt: "2026-01-01", checksum: "abc", totalBytes: -1, chunkCount: 1 },
      null,
    ]),
    [{ id: "ok", createdAt: "2026-01-01", checksum: "abc", totalBytes: 12, chunkCount: 1 }],
  );
});
