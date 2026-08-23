import assert from "node:assert/strict";
import test from "node:test";
import { nearbyDiscoveryUrl, nearbyPackagesUrl, normalizePairingCode } from "../app/nearby-sync-state.ts";

test("nearby sync URLs encode room, node and package identifiers", () => {
  assert.equal(nearbyDiscoveryUrl("home & family", "node/一"), "/api/p2p/discovery?room=home%20%26%20family&node=node%2F%E4%B8%80");
  assert.equal(nearbyPackagesUrl("a/b", "pkg?1"), "/api/p2p/packages?room=a%2Fb&id=pkg%3F1");
});

test("nearby pairing codes are normalized before network use", () => {
  assert.equal(normalizePairingCode(" ab-12 cd_34!56 "), "AB12CD34");
});
