import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAndroidCompanionConfig,
  buildQuickSyncExample,
  buildQuickSyncTemplate,
  createQuickSyncToken,
  loadQuickSyncStatus,
  revokeQuickSyncToken,
  testQuickSyncConnection,
} from "../app/quick-sync-actions.ts";

function requestStub(result = { ok: true, data: {} }) {
  const calls = [];
  const request = async (input, init) => {
    calls.push({ input, init });
    return { response: new Response(null, { status: result.ok ? 200 : 400 }), data: result.data };
  };
  request.calls = calls;
  return request;
}

test("quick-sync token actions keep endpoint, no-store read and bounded write payloads", async () => {
  const read = requestStub({ data: { active: true } });
  await loadQuickSyncStatus(read);
  assert.deepEqual(read.calls[0], {
    input: "/api/integrations/quick-sync",
    init: { cache: "no-store" },
  });

  const create = requestStub({ data: { active: true, token: "neo_secret" } });
  await createQuickSyncToken({ label: "手机", expiresInDays: 90, request: create });
  assert.deepEqual(JSON.parse(create.calls[0].init.body), {
    label: "手机",
    expiresInDays: 90,
    scope: "ledger:write",
  });
  assert.equal(create.calls[0].init.method, "POST");

  const revoke = requestStub();
  await revokeQuickSyncToken(revoke);
  assert.equal(revoke.calls[0].init.method, "DELETE");
});

test("quick-sync connection test uses explicit idempotency and ledger payload", async () => {
  const request = requestStub({ data: { id: 42 } });
  await testQuickSyncConnection({
    token: "neo_secret",
    ledgerId: 7,
    idempotencyKey: "ui-test-fixed",
    now: new Date("2026-08-19T12:00:00.000Z"),
    request,
  });
  const call = request.calls[0];
  assert.equal(call.input, "/api/v1/transactions");
  assert.equal(call.init.headers.Authorization, "Bearer neo_secret");
  assert.equal(call.init.headers["Idempotency-Key"], "ui-test-fixed");
  assert.deepEqual(JSON.parse(call.init.body), {
    ledgerId: 7,
    amount: 0.01,
    merchant: "自动记账连接测试",
    category: "餐饮",
    source: "connection-test",
    time: "2026-08-19T12:00:00.000Z",
  });
});

test("quick-sync templates normalize origins and keep secrets in generated config only", () => {
  const example = buildQuickSyncExample({
    origin: "https://ledger.example///",
    token: "neo_secret",
    ledgerId: 7,
    now: new Date("2026-08-19T12:00:00.000Z"),
  });
  assert.match(example, /https:\/\/ledger\.example\/api\/v1\/transactions/u);
  assert.match(example, /neo_secret/u);
  assert.doesNotMatch(example, /ledger\.example\/\//u);

  assert.deepEqual(JSON.parse(buildAndroidCompanionConfig({
    origin: "https://ledger.example///",
    token: "neo_secret",
    ledgerId: 7,
  })), {
    type: "neo-ledger-android-config-v1",
    url: "https://ledger.example",
    token: "neo_secret",
    ledgerId: 7,
  });

  const notification = JSON.parse(buildQuickSyncTemplate({
    kind: "notification",
    origin: "https://ledger.example///",
    token: "neo_secret",
    ledgerId: 7,
  }));
  assert.equal(notification.headers["Idempotency-Key"], "{{通知ID}}");
  assert.equal(notification.body.source, "notification-forwarder");
  assert.equal(notification.body.ledgerId, 7);
});
