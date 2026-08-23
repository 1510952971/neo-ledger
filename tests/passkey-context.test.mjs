import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { passkeyRequestContext } from "../app/passkey-context.ts";
import { passkeyBase64UrlToBytes, passkeyBytesToBase64Url } from "../app/passkey-encoding.ts";

test("Passkey context derives the exact RP ID and origin", () => {
  assert.deepEqual(
    passkeyRequestContext(new Request("https://ledger.example.com:8443/api/auth/passkeys")),
    { rpID: "ledger.example.com", origin: "https://ledger.example.com:8443" },
  );
});

test("Passkey allows HTTP only for explicitly local hosts", () => {
  assert.deepEqual(
    passkeyRequestContext(new Request("http://localhost:3000/api/auth/passkeys")),
    { rpID: "localhost", origin: "http://localhost:3000" },
  );
  assert.throws(
    () => passkeyRequestContext(new Request("http://ledger.example.com/api/auth/passkeys")),
    /HTTPS/u,
  );
});

test("Passkey browser actions use the bounded client response reader", async () => {
  const source = await readFile(new URL("../app/auth-panel.tsx", import.meta.url), "utf8");
  const start = source.indexOf("async function loadPasskeys");
  const end = source.indexOf("\n  if (user)", start);
  assert.ok(start >= 0 && end > start, "Passkey UI action region must remain discoverable");
  const region = source.slice(start, end);
  assert.match(region, /fetchClientJson/u);
  assert.doesNotMatch(region, /response\.json\(\)/u);
});

test("Passkey credential encoding is Web-standard and round-trips binary data", () => {
  const bytes = Uint8Array.from([0, 1, 2, 127, 128, 200, 255]);
  const encoded = passkeyBytesToBase64Url(bytes);
  assert.equal(encoded.includes("+") || encoded.includes("/") || encoded.includes("="), false);
  assert.deepEqual(passkeyBase64UrlToBytes(encoded), bytes);
  assert.throws(() => passkeyBase64UrlToBytes("bad~credential"), /编码无效/u);
  assert.throws(() => passkeyBase64UrlToBytes("a"), /编码无效/u);
});
