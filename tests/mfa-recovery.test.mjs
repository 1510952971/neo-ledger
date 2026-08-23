import assert from "node:assert/strict";
import test from "node:test";
import {
  createRecoveryCodes,
  isRecoveryCode,
  recoveryCodeHash,
} from "../app/mfa-recovery-core.ts";

test("recovery codes are unique, readable and carry at least 60 bits of entropy", () => {
  const codes = createRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[23456789A-HJ-NP-Z]{4}(?:-[23456789A-HJ-NP-Z]{4}){2}$/);
    assert.equal(isRecoveryCode(code), true);
  }
});

test("recovery code hashing is normalized and never stores the raw code", async () => {
  const code = "ABCD-EFGH-JK23";
  const hash = await recoveryCodeHash(code);
  assert.equal(hash, await recoveryCodeHash("abcd efgh jk23"));
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash.includes("ABCD"), false);
});

test("malformed and ambiguous recovery codes are rejected", () => {
  assert.equal(isRecoveryCode("ABCD-EFGH-JK23"), true);
  assert.equal(isRecoveryCode("ABCD-EFGH-I023"), false);
  assert.equal(isRecoveryCode("short-code"), false);
});
