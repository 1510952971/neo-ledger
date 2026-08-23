import assert from "node:assert/strict";
import test from "node:test";
import { initialQuickSyncState, quickSyncReducer } from "../app/quick-sync-state.ts";

test("quick sync token creation publishes one-time secret and metadata atomically", () => {
  const next = quickSyncReducer({ ...initialQuickSyncState, message: "旧错误" }, {
    type: "created",
    status: { active: true, tokenPrefix: "neo_", scope: "ledger:write" },
    token: "neo_secret",
    label: "手机",
  });
  assert.equal(next.token, "neo_secret");
  assert.equal(next.status.label, "手机");
  assert.equal(next.message, "新密钥只显示这一次，请立即复制保存。");
});

test("quick sync revocation clears the only full token copy", () => {
  const next = quickSyncReducer({ ...initialQuickSyncState, token: "sensitive", status: { active: true } }, { type: "revoked" });
  assert.deepEqual(next.status, { active: false });
  assert.equal(next.token, "");
  assert.equal(next.message, "自动记账密钥已撤销。");
});
