import assert from "node:assert/strict";
import test from "node:test";
import { createClientId } from "../app/client-id.js";

test("creates a UUID with the modern crypto API", () => {
  assert.equal(
    createClientId({ randomUUID: () => "uuid-from-browser" }),
    "uuid-from-browser",
  );
});

test("falls back to getRandomValues on older mobile browsers", () => {
  const source = {
    getRandomValues(bytes) {
      bytes.fill(1);
      return bytes;
    },
  };
  const id = createClientId(source);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("has a non-crypto fallback when browser crypto is unavailable", () => {
  assert.match(createClientId(null), /^id-[a-z0-9]+-[a-z0-9]+$/);
});
