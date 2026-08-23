import assert from "node:assert/strict";
import test from "node:test";
import { transactionEditPayloadFromForm } from "../app/ledger-transaction-actions.ts";

test("transaction edit payload preserves optimistic concurrency fields", () => {
  const form = new FormData();
  form.set("title", "改后的账单");
  form.set("amount", "66.5");
  form.set("occurredAt", "2026-08-19T13:00");
  const payload = transactionEditPayloadFromForm({
    ledgerId: 4,
    draft: {
      transaction: { id: 12, updatedAt: "2026-08-19T04:00:00.000Z" },
      type: "支出",
      accountId: 8,
      mood: "刚需",
      category: "餐饮",
      incomeCategory: "薪资发放",
    },
    formData: form,
    originalTimezone: "Asia/Shanghai",
  });
  assert.deepEqual(payload, {
    id: 12,
    ledgerId: 4,
    expectedUpdatedAt: "2026-08-19T04:00:00.000Z",
    title: "改后的账单",
    amount: 66.5,
    occurredAt: "2026-08-19T13:00",
    originalTimezone: "Asia/Shanghai",
    type: "支出",
    accountId: 8,
    mood: "刚需",
    category: "餐饮",
    incomeCategory: "薪资发放",
  });
});
