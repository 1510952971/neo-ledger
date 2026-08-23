import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientModules = [
  "app/auth-panel.tsx",
  "app/privacy-lock.ts",
  "app/forecast-state.ts",
  "app/app-update-control.ts",
  "app/restore-actions.ts",
  "app/ai-chat-state.ts",
  "app/nearby-actions.ts",
  "app/notification-actions.ts",
  "app/reconciliation-actions.ts",
];

test("client financial/auth modules keep one bounded JSON response boundary", async () => {
  const sources = await Promise.all(
    clientModules.map(async (file) => [file, await readFile(new URL(`../${file}`, import.meta.url), "utf8")]),
  );
  for (const [file, source] of sources) {
    assert.match(source, /fetchClientJson/u, `${file} must use the bounded client reader`);
    assert.doesNotMatch(source, /response\.json\(\)/u, `${file} must not parse responses without a size limit`);
  }
});

test("the main ledger page has no unbounded browser fetch escape hatch", async () => {
  const source = await readFile(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");
  assert.match(source, /fetchClientText/u);
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
});

test("large ledgers use a bounded SSR transaction window and server summary", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const query = await readFile(new URL("../app/large-bill-query-state.ts", import.meta.url), "utf8");
  assert.match(page, /INITIAL_TRANSACTION_PAGE_SIZE\s*=\s*100/u);
  assert.match(page, /\.limit\(INITIAL_TRANSACTION_PAGE_SIZE\)/u);
  assert.match(page, /transactionTotal=/u);
  assert.match(query, /fetchClientJson/u);
  assert.match(query, /limit: String\(pageSize\)/u);
  assert.doesNotMatch(query, /response\.json\(\)/u);
});

test("SSR planning and account collections reuse the server-side hard limits", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const limit of [
    "MAX_LEDGER_COUNT",
    "MAX_ACCOUNT_COUNT",
    "MAX_CATEGORY_COUNT",
    "MAX_SUBSCRIPTION_COUNT",
    "MAX_SAVINGS_GOAL_COUNT",
    "MAX_MEMBER_COUNT",
    "MAX_INSTALLMENT_COUNT",
    "MAX_ASSET_COUNT",
  ]) {
    assert.match(page, new RegExp(`\\.limit\\(${limit}\\)`, "u"), `SSR must bound ${limit}`);
  }
});

test("browser auth, notification and nearby flows keep API calls behind the shared boundary", async () => {
  const files = ["app/auth-panel.tsx", "app/notification-actions.ts", "app/nearby-actions.ts"];
  for (const file of files) {
    const source = await readFile(new URL("../" + file, import.meta.url), "utf8");
    assert.match(source, /fetchClientJson/u, "must use the bounded client reader: " + file);
    assert.doesNotMatch(source, /\bfetch\s*\(/u, "must not issue an unbounded browser API request: " + file);
    assert.doesNotMatch(source, /response\.json\(\)/u, "must not parse responses without a size limit: " + file);
  }
  const state = await readFile(new URL("../app/nearby-sync-state.ts", import.meta.url), "utf8");
  assert.doesNotMatch(state, /response\.json\(\)/u);
  const notificationState = await readFile(new URL("../app/notification-center-state.ts", import.meta.url), "utf8");
  assert.doesNotMatch(notificationState, /fetchClientJson/u);
  const restoreState = await readFile(new URL("../app/data-center-restore-state.ts", import.meta.url), "utf8");
  assert.doesNotMatch(restoreState, /fetchClientJson/u);
  const reconciliationState = await readFile(new URL("../app/reconciliation-state.ts", import.meta.url), "utf8");
  assert.doesNotMatch(reconciliationState, /fetchClientJson/u);
});

test("OAuth provider responses use bounded external readers", async () => {
  const source = await readFile(new URL("../app/oauth.ts", import.meta.url), "utf8");
  assert.match(source, /fetchWithTimeout/u);
  assert.match(source, /readResponseTextWithLimit/u);
  assert.match(source, /readResponseBytesWithLimit/u);
  assert.doesNotMatch(source, /response\.json\(\)/u);
  assert.doesNotMatch(source, /response\.arrayBuffer\(\)/u);
});

test("email delivery responses use bounded external readers", async () => {
  const source = await readFile(new URL("../app/mailer.ts", import.meta.url), "utf8");
  assert.match(source, /fetchWithTimeout/u);
  assert.match(source, /readResponseTextWithLimit/u);
  assert.doesNotMatch(source, /response\.text\(\)/u);
});

test("restore snapshot creation bounds the internal export response", async () => {
  const source = await readFile(new URL("../app/restore-snapshot.ts", import.meta.url), "utf8");
  assert.match(source, /readResponseTextWithLimit/u);
  assert.doesNotMatch(source, /response\.text\(\)/u);
});

test("offline sync does not trust server ids outside the submitted queue", async () => {
  const source = await readFile(new URL("../app/offline-actions.ts", import.meta.url), "utf8");
  assert.match(source, /submittedIds/u);
  assert.match(source, /filter\(\s*\(id\)/u);
});
