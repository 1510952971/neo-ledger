import assert from "node:assert/strict";
import test from "node:test";
import {
  loadNotificationData,
  markNotificationsRead,
  notificationUrls,
} from "../app/notification-actions.ts";

function requestStub() {
  const calls = [];
  const request = async (input, init) => {
    calls.push({ input, init });
    if (String(input).includes("pending-transactions"))
      return { response: new Response(null, { status: 200, headers: { "x-total-count": "3" } }), data: [] };
    return { response: new Response(null, { status: 200 }), data: [] };
  };
  request.calls = calls;
  return request;
}

test("notification URLs keep bounded pending limit and ledger scope", () => {
  assert.deepEqual(notificationUrls(7), {
    pending: "/api/pending-transactions?ledger=7&limit=100",
    notices: "/api/notifications?ledger=7",
  });
});

test("notification reload performs no-store pending and notice reads", async () => {
  const request = requestStub();
  const result = await loadNotificationData({ ledgerId: 7, request });
  assert.equal(result.pending.response.headers.get("x-total-count"), "3");
  assert.equal(request.calls.length, 2);
  assert.deepEqual(request.calls.map((call) => call.init), [
    { cache: "no-store" },
    { cache: "no-store" },
  ]);
});

test("marking notifications read scopes the ledger and uses PATCH", async () => {
  const request = requestStub();
  await markNotificationsRead({ ledgerId: 7, request });
  const call = request.calls[0];
  assert.equal(call.input, "/api/notifications");
  assert.equal(call.init.method, "PATCH");
  assert.deepEqual(JSON.parse(call.init.body), { ledgerId: 7 });
});
