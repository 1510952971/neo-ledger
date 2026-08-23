import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const policy = readFileSync("SECURITY.md", "utf8");

test("security policy provides a private disclosure path and response SLA", () => {
  assert.match(policy, /^# Security policy/mu);
  assert.match(policy, /private report/u);
  assert.match(policy, /2 business days/u);
  assert.match(policy, /5 business days/u);
  assert.match(policy, /7 days/u);
  assert.match(policy, /Do not open a public issue/u);
  assert.match(policy, /^## Supported versions/mu);
});

test("security policy protects financial data and credentials", () => {
  assert.match(policy, /do not publish.*credential.*backup.*customer data/iu);
  assert.match(policy, /session tokens/u);
  assert.match(policy, /audit-table access/u);
});
