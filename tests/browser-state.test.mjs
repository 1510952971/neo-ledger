import assert from "node:assert/strict";
import test from "node:test";
import { restoreBrowserState } from "../app/browser-state.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    values,
  };
}

test("restores WebDAV and P2P settings after hydration", () => {
  const storage = memoryStorage({
    "neo-webdav-config": JSON.stringify({
      url: "https://dav.example.test/ledger",
      username: "peng",
      autoSync: true,
      intervalMinutes: 15,
    }),
    "neo-p2p-node": "node-existing",
  });
  const result = restoreBrowserState({
    storage,
    online: false,
    createNodeId: () => "unused-random-id",
  });
  assert.deepEqual(result, {
    isOnline: false,
    webdavConfig: {
      url: "https://dav.example.test/ledger",
      username: "peng",
      autoSync: true,
      intervalMinutes: 15,
    },
    p2pNode: "node-existing",
  });
});

test("creates and persists a P2P identity on first use", () => {
  const storage = memoryStorage();
  const result = restoreBrowserState({
    storage,
    online: true,
    createNodeId: () => "12345678-rest-of-id",
  });
  assert.equal(result.p2pNode, "node-12345678");
  assert.equal(storage.values.get("neo-p2p-node"), "node-12345678");
});

test("keeps a temporary P2P identity when storage is blocked", () => {
  const blocked = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  const result = restoreBrowserState({
    storage: blocked,
    online: true,
    createNodeId: () => "abcdefgh-rest-of-id",
  });
  assert.deepEqual(result.webdavConfig, {
    url: "",
    username: "",
    autoSync: false,
    intervalMinutes: 5,
  });
  assert.equal(result.p2pNode, "node-abcdefgh");
});
