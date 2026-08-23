import assert from "node:assert/strict";
import test from "node:test";
import { syncOfflineEntries } from "../app/offline-actions.ts";

function responseStub(calls, ok, data) {
  return async (input, init, maxBytes) => {
    calls.push({ input: String(input), init, maxBytes });
    return { response: new Response(null, { status: ok ? 200 : 503 }), data };
  };
}

test("离线动作在线时提交并删除已确认条目", async () => {
  const calls = [];
  const removed = [];
  let lists = [[{ offlineId: "a" }, { offlineId: "b" }], [{ offlineId: "b" }]];
  const remaining = await syncOfflineEntries({
    online: true,
    list: async () => lists.shift() ?? [],
    remove: async (ids) => removed.push(...ids),
    request: responseStub(calls, true, { synced: ["a"] }),
  });
  assert.equal(remaining, 1);
  assert.deepEqual(removed, ["a"]);
  assert.equal(calls[0].input, "/api/offline-sync");
  assert.equal(calls[0].maxBytes > 0, true);
});

test("离线动作离线或服务失败时不删除本地条目", async () => {
  const calls = [];
  const removed = [];
  const items = [{ offlineId: "a" }];
  const offline = await syncOfflineEntries({ online: false, list: async () => items, remove: async (ids) => removed.push(...ids), request: responseStub(calls, true, { synced: ["a"] }) });
  assert.equal(offline, 1);
  assert.equal(calls.length, 0);
  const failed = await syncOfflineEntries({ online: true, list: async () => items, remove: async (ids) => removed.push(...ids), request: responseStub(calls, false, { error: "暂时失败" }) });
  assert.equal(failed, 1);
  assert.deepEqual(removed, []);
});

test("离线动作只删除本次实际提交且去重后的队列编号", async () => {
  const removed = [];
  const remaining = await syncOfflineEntries({
    online: true,
    list: async () => [{ offlineId: "a" }, { offlineId: "b" }],
    remove: async (ids) => removed.push(...ids),
    request: responseStub([], true, { synced: ["a", "ghost", "a", 7, "b"] }),
  });
  assert.equal(remaining, 2);
  assert.deepEqual(removed, ["a", "b"]);
});

test("离线同步单次请求最多提交固定队列上限", async () => {
  const items = Array.from({ length: 60 }, (_, index) => ({ offlineId: `entry-${index}` }));
  const calls = [];
  await syncOfflineEntries({
    online: true,
    list: async () => items,
    remove: async () => undefined,
    request: async (input, init) => {
      calls.push(JSON.parse(init.body));
      return { response: new Response(null, { status: 503 }), data: null };
    },
  });
  assert.equal(calls[0].items.length, 50);
});

test("离线同步跳过损坏或超预算的历史队列记录", async () => {
  const calls = [];
  await syncOfflineEntries({
    online: true,
    list: async () => [{ offlineId: "valid" }, { offlineId: "bad id" }, { offlineId: "too-big", note: "x".repeat(17 * 1024) }],
    remove: async () => undefined,
    request: async (input, init) => {
      calls.push(JSON.parse(init.body));
      return { response: new Response(null, { status: 503 }), data: null };
    },
  });
  assert.deepEqual(calls[0].items.map((item) => item.offlineId), ["valid"]);
});
