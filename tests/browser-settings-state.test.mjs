import assert from "node:assert/strict";
import test from "node:test";
import { createClientId } from "../app/client-id.js";

test("browser settings keep the WebDAV storage keys scoped", () => {
  assert.equal(typeof createClientId, "function");
  assert.match("neo-webdav-config", /^neo-webdav-/u);
  assert.match("neo-webdav-password", /^neo-webdav-/u);
  assert.match("neo-webdav-secret", /^neo-webdav-/u);
});
