import assert from "node:assert/strict";
import test from "node:test";
import {
  announceNearbyDevice,
  deleteNearbyPackage,
  discoverNearbyPeers,
  downloadNearbyPackage,
  leaveNearbyDiscovery,
  listNearbyPackages,
  uploadNearbyPackage,
} from "../app/nearby-actions.ts";

function requestStub(data = {}) {
  const calls = [];
  const request = async (input, init, maxBytes) => {
    calls.push({ input, init, maxBytes });
    return { response: new Response(null, { status: 200 }), data };
  };
  request.calls = calls;
  return request;
}

test("nearby package upload keeps the room and bounded response", async () => {
  const request = requestStub({ id: "pkg-1" });
  await uploadNearbyPackage({ room: "ROOM/1", payload: "encrypted", request });
  assert.equal(request.calls[0].input, "/api/p2p/packages");
  assert.equal(request.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(request.calls[0].init.body), {
    room: "ROOM/1",
    payload: "encrypted",
  });
  assert.equal(request.calls[0].maxBytes, 8 * 1024 * 1024);
});

test("nearby package download and deletion encode room/package IDs", async () => {
  const download = requestStub({ payload: "encrypted" });
  await downloadNearbyPackage({ room: "ROOM/1", packageId: "pkg/1", request: download });
  assert.equal(download.calls[0].input, "/api/p2p/packages?room=ROOM%2F1&id=pkg%2F1");
  assert.deepEqual(download.calls[0].init, { cache: "no-store" });
  assert.equal(download.calls[0].maxBytes, 8 * 1024 * 1024);

  const remove = requestStub();
  await deleteNearbyPackage({ room: "ROOM/1", packageId: "pkg/1", request: remove });
  assert.equal(remove.calls[0].input, "/api/p2p/packages?room=ROOM%2F1&id=pkg%2F1");
  assert.equal(remove.calls[0].init.method, "DELETE");
  assert.equal(remove.calls[0].maxBytes, 8 * 1024 * 1024);
});

test("nearby discovery actions keep room/node encoding and lifecycle methods", async () => {
  const announce = requestStub();
  await announceNearbyDevice({ room: "ROOM/1", nodeId: "node/1", label: "Mac", request: announce });
  assert.equal(announce.calls[0].input, "/api/p2p/discovery");
  assert.deepEqual(JSON.parse(announce.calls[0].init.body), {
    room: "ROOM/1",
    nodeId: "node/1",
    label: "Mac",
  });

  const discover = requestStub({ peers: [], accessUrl: "https://ledger.example" });
  await discoverNearbyPeers({ room: "ROOM/1", nodeId: "node/1", request: discover });
  assert.equal(discover.calls[0].input, "/api/p2p/discovery?room=ROOM%2F1&node=node%2F1");
  assert.deepEqual(discover.calls[0].init, { cache: "no-store" });

  const leave = requestStub();
  await leaveNearbyDiscovery({ room: "ROOM/1", nodeId: "node/1", request: leave });
  assert.equal(leave.calls[0].init.method, "DELETE");
  assert.equal(leave.calls[0].init.keepalive, true);

  const list = requestStub({ packages: [] });
  await listNearbyPackages({ room: "ROOM/1", request: list });
  assert.equal(list.calls[0].input, "/api/p2p/packages?room=ROOM%2F1");
  assert.equal(list.calls[0].maxBytes, 8 * 1024 * 1024);
});
