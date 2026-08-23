import assert from "node:assert/strict";
import test from "node:test";
import {
  ClientApiError,
  fetchClientText,
  fetchClientJson,
  MAX_OFFLINE_SYNC_RESPONSE_BYTES,
  MAX_P2P_PACKAGE_RESPONSE_BYTES,
  MAX_RESTORE_UPLOAD_BYTES,
  MAX_SYNC_SNAPSHOT_RESPONSE_BYTES,
  MAX_WEBDAV_RESPONSE_BYTES,
  parseClientJson,
} from "../app/client-api.ts";

test("client API parser accepts empty and valid JSON responses", () => {
  assert.equal(parseClientJson(""), null);
  assert.deepEqual(parseClientJson('{"ok":true}'), { ok: true });
});

test("client API parser rejects malformed upstream JSON", () => {
  assert.throws(() => parseClientJson("not-json"), ClientApiError);
});

test("client API fetch rejects oversized response bodies before JSON parsing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("x".repeat(32), { headers: { "content-length": "32" } });
  try {
    await assert.rejects(
      fetchClientJson("/api/test", {}, 16),
      (error) => error instanceof ClientApiError && error.status === 502,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("client API text reader bounds local and protocol text responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("bounded-text", { headers: { "content-length": "12" } });
  try {
    const result = await fetchClientText("blob:neo-ledger", {}, 32);
    assert.equal(result.text, "bounded-text");
    await assert.rejects(fetchClientText("blob:neo-ledger", {}, 4), ClientApiError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("client API preserves caller cancellation while applying its own timeout", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init = {}) =>
    await new Promise((_, reject) => {
      init.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  const controller = new AbortController();
  try {
    const request = fetchClientJson("/api/cancel", { signal: controller.signal }, 1024, 10_000);
    controller.abort();
    await assert.rejects(request, (error) => error instanceof DOMException && error.name === "AbortError");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sync response budgets stay finite and leave ordinary API defaults unchanged", () => {
  assert.equal(MAX_P2P_PACKAGE_RESPONSE_BYTES, 8 * 1024 * 1024);
  assert.equal(MAX_OFFLINE_SYNC_RESPONSE_BYTES, 8 * 1024 * 1024);
  assert.equal(MAX_RESTORE_UPLOAD_BYTES, 50 * 1024 * 1024);
  assert.equal(MAX_SYNC_SNAPSHOT_RESPONSE_BYTES, 50 * 1024 * 1024);
  assert.equal(MAX_WEBDAV_RESPONSE_BYTES, 55 * 1024 * 1024);
});
