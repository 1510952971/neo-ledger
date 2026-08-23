import assert from "node:assert/strict";
import test from "node:test";
import {
  loadRestoreSnapshots,
  restoreBackupPayload,
  restoreSnapshotData,
  restoreSavedSnapshot,
} from "../app/restore-actions.ts";

function requestStub() {
  const calls = [];
  const request = async (input, init, maxBytes) => {
    calls.push({ input, init, maxBytes });
    return { response: new Response(null, { status: 200 }), data: { summary: { restored: 2 } } };
  };
  request.calls = calls;
  return request;
}

test("restore backup action posts raw backup payload with finite response budget", async () => {
  const request = requestStub();
  await restoreBackupPayload({ payload: '{"version":30}', dryRun: true, planChecksum: "a".repeat(64), request });
  assert.equal(request.calls[0].input, "/api/data/restore");
  assert.equal(request.calls[0].init.method, "POST");
  assert.equal(request.calls[0].init.body, '{"version":30}');
  assert.equal(request.calls[0].init.headers.get("X-Restore-Dry-Run"), "1");
  assert.equal(request.calls[0].init.headers.get("X-Restore-Plan-Checksum"), "a".repeat(64));
  assert.equal(request.calls[0].maxBytes, 50 * 1024 * 1024);
});

test("restore snapshot list action uses no-store and finite response budget", async () => {
  const request = requestStub();
  await loadRestoreSnapshots({ request });
  assert.deepEqual(request.calls[0].init, { cache: "no-store" });
  assert.equal(request.calls[0].input, "/api/data/restore");
  assert.equal(request.calls[0].maxBytes, 50 * 1024 * 1024);
});

test("saved snapshot restore action sends only the selected snapshot id", async () => {
  const request = requestStub();
  await restoreSavedSnapshot({ snapshotId: "snapshot-7", planChecksum: "b".repeat(64), request });
  assert.deepEqual(JSON.parse(request.calls[0].init.body), {
    restoreSnapshotId: "snapshot-7",
  });
  assert.equal(request.calls[0].init.headers.get("X-Restore-Plan-Checksum"), "b".repeat(64));
  assert.equal(request.calls[0].maxBytes, 50 * 1024 * 1024);
});

test("merged snapshot restore action sends the complete merged document", async () => {
  const request = requestStub();
  await restoreSnapshotData({ snapshot: { version: 30, ledgers: [{ id: 1 }] }, request });
  assert.deepEqual(JSON.parse(request.calls[0].init.body), {
    version: 30,
    ledgers: [{ id: 1 }],
  });
  assert.equal(request.calls[0].maxBytes, 50 * 1024 * 1024);
});
