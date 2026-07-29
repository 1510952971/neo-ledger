import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptPeerSnapshotChunk,
  createPeerSnapshotChunks,
  MAX_ACTIVE_PEER_TRANSFERS,
  MAX_PEER_CHUNKS,
} from "../app/p2p-sync-core.js";

test("reassembles peer snapshot chunks received out of order", () => {
  const payload = JSON.stringify({ ledgers: [{ id: 1 }], note: "x".repeat(80) });
  const chunks = createPeerSnapshotChunks(payload, {
    transferId: "transfer-1",
    transferType: "sync",
    chunkSize: 20,
  });
  const transfers = new Map();
  let result;
  for (const chunk of [chunks[2], chunks[0], ...chunks.slice(3), chunks[1]])
    result = acceptPeerSnapshotChunk(transfers, chunk);
  assert.equal(result.status, "complete");
  assert.equal(result.serialized, payload);
  assert.equal(result.transferType, "sync");
  assert.equal(transfers.size, 0);
});

test("does not complete a transfer with a missing or duplicate chunk", () => {
  const chunks = createPeerSnapshotChunks("abcdefghijklmnopqrstuvwxyz", {
    transferId: "transfer-2",
    transferType: "reply",
    chunkSize: 10,
  });
  const transfers = new Map();
  assert.equal(acceptPeerSnapshotChunk(transfers, chunks[0]).status, "partial");
  const duplicate = acceptPeerSnapshotChunk(transfers, chunks[0]);
  assert.equal(duplicate.status, "partial");
  assert.equal(duplicate.received, 1);
  const missing = acceptPeerSnapshotChunk(transfers, chunks[2]);
  assert.equal(missing.status, "partial");
  assert.equal(missing.received, 2);
  assert.equal(transfers.size, 1);
});

test("rejects malformed or inconsistent peer chunks without allocating them", () => {
  const transfers = new Map();
  assert.equal(
    acceptPeerSnapshotChunk(transfers, {
      type: "chunk",
      transferId: "huge",
      transferType: "sync",
      index: 0,
      total: MAX_PEER_CHUNKS + 1,
      data: "x",
    }).status,
    "ignored",
  );
  const first = {
    type: "chunk",
    transferId: "mixed",
    transferType: "sync",
    index: 0,
    total: 2,
    data: "a",
  };
  assert.equal(acceptPeerSnapshotChunk(transfers, first).status, "partial");
  assert.equal(
    acceptPeerSnapshotChunk(transfers, { ...first, transferType: "reply", index: 1 })
      .status,
    "ignored",
  );
  assert.equal(transfers.get("mixed").received, 1);
});

test("bounds unfinished transfers and evicts the oldest one", () => {
  const transfers = new Map();
  for (let index = 0; index <= MAX_ACTIVE_PEER_TRANSFERS; index++)
    acceptPeerSnapshotChunk(transfers, {
      type: "chunk",
      transferId: `transfer-${index}`,
      transferType: "sync",
      index: 0,
      total: 2,
      data: "first-half",
    });
  assert.equal(transfers.size, MAX_ACTIVE_PEER_TRANSFERS);
  assert.equal(transfers.has("transfer-0"), false);
  assert.equal(transfers.has(`transfer-${MAX_ACTIVE_PEER_TRANSFERS}`), true);
});
