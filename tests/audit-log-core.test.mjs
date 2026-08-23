import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeAuditCursor,
  encodeAuditCursor,
  MAX_AUDIT_METADATA_BYTES,
  normalizeAuditMetadata,
} from "../app/audit-log-core.ts";

test("audit metadata keeps primitive fields within a bounded byte budget", () => {
  const normalized = normalizeAuditMetadata({
    "  request ": "ok",
    count: 3,
    enabled: true,
    invalid: { secret: "should not persist" },
  });
  assert.equal(normalized.request, "ok");
  assert.equal(normalized.count, 3);
  assert.equal("invalid" in normalized, false);
  assert.ok(new TextEncoder().encode(JSON.stringify(normalized)).byteLength <= MAX_AUDIT_METADATA_BYTES);
});

test("audit metadata truncates oversized values and records a safe summary", () => {
  const oversized = Object.fromEntries(Array.from({ length: 32 }, (_, index) => [`field-${index}`, "x".repeat(512)]));
  const normalized = normalizeAuditMetadata(oversized);
  assert.equal(normalized.truncated, true);
  assert.equal(normalized.fields, 32);
  assert.ok(new TextEncoder().encode(JSON.stringify(normalized)).byteLength <= MAX_AUDIT_METADATA_BYTES);
  assert.ok(String(normalized["field-0"] ?? "").length <= 64);
});

test("audit cursor is opaque, bounded and rejects tampering", () => {
  const cursor = { createdAt: "2026-08-19 12:00:00", id: "audit-event-001" };
  const encoded = encodeAuditCursor(cursor);
  assert.deepEqual(decodeAuditCursor(encoded), cursor);
  assert.equal(decodeAuditCursor("not-a-cursor"), null);
  assert.equal(decodeAuditCursor("") , null);
  assert.equal(decodeAuditCursor(encodeAuditCursor({ createdAt: "\n", id: "audit-event-001" })), null);
});
