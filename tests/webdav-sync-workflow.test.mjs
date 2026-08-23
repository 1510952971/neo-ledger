import assert from "node:assert/strict";
import test from "node:test";
import { runWebDavSyncWorkflow } from "../app/webdav-sync-workflow.ts";

const ok = (data = {}) => ({ response: new Response(null, { status: 200 }), data });
const missing = (error = "404 没有备份") => ({ response: new Response(null, { status: 404 }), data: { error } });

function baseOps(overrides = {}) {
  const calls = [];
  const ops = {
    calls,
    exportSnapshot: async () => {
      calls.push("export");
      return ok({ local: true });
    },
    encrypt: async (snapshot, secret) => {
      calls.push(["encrypt", snapshot, secret]);
      return "ciphertext";
    },
    decrypt: async (payload, secret) => {
      calls.push(["decrypt", payload, secret]);
      return { remote: true };
    },
    merge: (local, remote) => {
      calls.push(["merge", local, remote]);
      return { merged: true, mergeReport: { conflictCount: 2 } };
    },
    upload: async (payload) => {
      calls.push(["upload", payload]);
      return ok();
    },
    download: async () => {
      calls.push("download");
      return ok({ payload: "ciphertext" });
    },
    restore: async (snapshot) => {
      calls.push(["restore", snapshot]);
      return ok();
    },
    ...overrides,
  };
  return ops;
}

test("WebDAV upload workflow exports, encrypts and uploads without local restore", async () => {
  const ops = baseOps();
  const result = await runWebDavSyncWorkflow({ mode: "upload", secret: "secret-123", ...ops });
  assert.equal(result.status, "刚刚完成加密上传");
  assert.equal(result.changedLocal, false);
  assert.deepEqual(ops.calls.map((item) => Array.isArray(item) ? item[0] : item), ["export", "encrypt", "upload"]);
});

test("smart workflow creates the first remote backup when the server has none", async () => {
  const ops = baseOps({ download: async () => { ops.calls.push("download"); return missing(); } });
  const result = await runWebDavSyncWorkflow({ mode: "smart", secret: "secret-123", ...ops });
  assert.equal(result.status, "首次安全同步完成，已创建云端加密备份");
  assert.equal(result.changedLocal, false);
  assert.deepEqual(ops.calls.map((item) => Array.isArray(item) ? item[0] : item), ["export", "download", "encrypt", "upload"]);
});

test("smart workflow merges, uploads and restores the merged snapshot", async () => {
  const ops = baseOps();
  const result = await runWebDavSyncWorkflow({ mode: "smart", secret: "secret-123", ...ops });
  assert.equal(result.status, "刚刚完成安全双向同步 · 自动解决 2 项冲突");
  assert.equal(result.changedLocal, true);
  assert.deepEqual(result.mergeReport, { conflictCount: 2 });
  assert.deepEqual(ops.calls.map((item) => Array.isArray(item) ? item[0] : item), ["export", "download", "decrypt", "merge", "encrypt", "upload", "restore"]);
});

test("download workflow restores the remote snapshot without uploading it", async () => {
  const ops = baseOps();
  const result = await runWebDavSyncWorkflow({ mode: "download", secret: "secret-123", ...ops });
  assert.equal(result.status, "刚刚从云端解密恢复");
  assert.equal(result.changedLocal, true);
  assert.deepEqual(ops.calls.map((item) => Array.isArray(item) ? item[0] : item), ["export", "download", "decrypt", "restore"]);
});

test("smart workflow surfaces non-missing remote errors without restoring", async () => {
  const ops = baseOps({ download: async () => { ops.calls.push("download"); return missing("上游服务暂时不可用"); } });
  await assert.rejects(
    runWebDavSyncWorkflow({ mode: "smart", secret: "secret-123", ...ops }),
    /上游服务暂时不可用/u,
  );
  assert.deepEqual(ops.calls.map((item) => Array.isArray(item) ? item[0] : item), ["export", "download"]);
});

test("WebDAV workflow refuses an empty local snapshot response", async () => {
  const ops = baseOps({ exportSnapshot: async () => ({ response: new Response(null, { status: 200 }), data: null }) });
  await assert.rejects(
    runWebDavSyncWorkflow({ mode: "upload", secret: "secret-123", ...ops }),
    /读取本地账本失败/u,
  );
  assert.equal(ops.calls.some((item) => item === "encrypt" || item?.[0] === "encrypt"), false);
});
