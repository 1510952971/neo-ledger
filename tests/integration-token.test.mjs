import test from "node:test";
import assert from "node:assert/strict";
import {
  createIntegrationToken,
  hashIntegrationToken,
} from "../app/integration-token-core.js";

test("automatic bookkeeping tokens are URL-safe and sufficiently long", () => {
  const token = createIntegrationToken(new Uint8Array(24).fill(17));
  assert.match(token, /^nls_[A-Za-z0-9_-]{32}$/);
});

test("only a one-way token hash needs to be stored", async () => {
  const first = createIntegrationToken(new Uint8Array(24).fill(1));
  const second = createIntegrationToken(new Uint8Array(24).fill(2));
  const firstHash = await hashIntegrationToken(first);
  assert.equal(firstHash.length, 64);
  assert.notEqual(firstHash, first);
  assert.notEqual(firstHash, await hashIntegrationToken(second));
});
