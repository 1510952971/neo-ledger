import test from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, verifyTotp } from "../app/totp.ts";

test("TOTP uses RFC 6238-compatible SHA-1 codes", async () => {
  // RFC 6238 test secret "12345678901234567890" at t=59s.
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(new TextDecoder().decode(base32Decode(secret)), "12345678901234567890");
  assert.equal(base32Encode(base32Decode(secret)), secret);
  assert.equal(await verifyTotp(secret, "287082", 59_000), 1);
  assert.equal(await verifyTotp(secret, "000000", 59_000), null);
});
