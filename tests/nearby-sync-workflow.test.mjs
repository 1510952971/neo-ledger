import assert from "node:assert/strict";
import test from "node:test";
import { runNearbyMergeWorkflow } from "../app/nearby-sync-workflow.ts";

const ok = (data = {}) => ({ response: new Response(null, { status: 200 }), data });
const fail = (error) => ({ response: new Response(null, { status: 500 }), data: { error } });

function operations(overrides = {}) {
  const calls = [];
  const ops = {
    calls,
    decrypt: async (payload, secret) => {
      calls.push(["decrypt", payload, secret]);
      return { remote: true };
    },
    exportSnapshot: async () => {
      calls.push("export");
      return ok({ local: true });
    },
    merge: (local, remote) => {
      calls.push(["merge", local, remote]);
      return { merged: true, mergeReport: { conflictCount: 1 } };
    },
    restore: async (snapshot) => {
      calls.push(["restore", snapshot]);
      return ok();
    },
    deletePackage: async (room, packageId) => {
      calls.push(["delete", room, packageId]);
      return ok();
    },
    ...overrides,
  };
  return ops;
}

test("nearby merge workflow derives the pairing secret and restores without package cleanup", async () => {
  const ops = operations();
  const result = await runNearbyMergeWorkflow({
    payload: "cipher",
    pairingCode: "ABCD2345",
    room: "room-1",
    ...ops,
  });
  assert.equal(result.status, "附近同步完成，已按更新时间解决 1 项冲突，正在刷新账本…");
  assert.deepEqual(result.mergeReport, { conflictCount: 1 });
  assert.deepEqual(ops.calls.map((item) => Array.isArray(item) ? item[0] : item), ["decrypt", "export", "merge", "restore"]);
  assert.equal(ops.calls[0][2], "nearby:ABCD2345");
});

test("nearby merge workflow deletes the consumed remote package after restore", async () => {
  const ops = operations();
  await runNearbyMergeWorkflow({
    payload: "cipher",
    pairingCode: "ABCD2345",
    packageId: "package-9",
    room: "room-1",
    ...ops,
  });
  assert.deepEqual(ops.calls.at(-1), ["delete", "room-1", "package-9"]);
});

test("nearby merge workflow stops before deletion when restore fails", async () => {
  const ops = operations({ restore: async () => { ops.calls.push("restore"); return fail("恢复失败"); } });
  await assert.rejects(
    runNearbyMergeWorkflow({
      payload: "cipher",
      pairingCode: "ABCD2345",
      packageId: "package-9",
      room: "room-1",
      ...ops,
    }),
    /恢复失败/u,
  );
  assert.equal(ops.calls.includes("delete"), false);
});

test("nearby merge workflow surfaces package cleanup failure after local restore", async () => {
  const ops = operations({ deletePackage: async () => { ops.calls.push("delete"); return fail("包清理失败"); } });
  await assert.rejects(
    runNearbyMergeWorkflow({
      payload: "cipher",
      pairingCode: "ABCD2345",
      packageId: "package-9",
      room: "room-1",
      ...ops,
    }),
    /包清理失败/u,
  );
  assert.equal(ops.calls.some((item) => item === "restore" || item?.[0] === "restore"), true);
});

test("nearby merge workflow refuses an empty local snapshot response", async () => {
  const ops = operations({ exportSnapshot: async () => ok(null) });
  await assert.rejects(
    runNearbyMergeWorkflow({ payload: "cipher", pairingCode: "ABCD2345", room: "room-1", ...ops }),
    /读取本地账本失败/u,
  );
  assert.equal(ops.calls.some((item) => item === "merge" || item?.[0] === "merge"), false);
});
