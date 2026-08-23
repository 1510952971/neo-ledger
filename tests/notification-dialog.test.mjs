import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../app/notification-dialog.tsx", import.meta.url), "utf8");

test("notification center is composed through a bounded dialog", () => {
  assert.match(page, /<NotificationDialog\b/u);
  assert.match(page, /onProcessPending=/u);
  assert.doesNotMatch(page, /<dialog className="expense-dialog notice-dialog"/u);
});

test("notification dialog keeps notice and pending transaction actions explicit", () => {
  assert.match(dialog, /notices\.slice\(0, 10\)/u);
  assert.match(dialog, /<PendingTransactionSection\b/u);
  assert.match(dialog, /onRefresh=\{onRefreshPending\}/u);
  assert.match(dialog, /onProcess=\{onProcessPending\}/u);
  assert.match(dialog, /Idempotency-Key: bank-message-unique-id/u);
});
