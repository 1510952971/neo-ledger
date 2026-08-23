import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseExternalTransactionInput } from "../app/external-transaction-contract.ts";

test("versioned external transactions require ledger and idempotency boundaries", () => {
  assert.throws(
    () => parseExternalTransactionInput({ amount: 1 }, { requireLedgerId: true, requireIdempotencyKey: true }),
    (error) => error.code === "validation_failed",
  );
  assert.throws(
    () => parseExternalTransactionInput({ ledgerId: 1, amount: 1 }, { requireLedgerId: true, requireIdempotencyKey: true }),
    (error) => error.code === "idempotency_key_required",
  );
});

test("valid structured and notification payloads normalize without losing fields", () => {
  assert.deepEqual(
    parseExternalTransactionInput(
      { ledgerId: 3, accountId: 7, amount: 12.5, merchant: " 便利店 ", type: "支出" },
      { requireLedgerId: true, requireIdempotencyKey: true, idempotencyKey: "phone-event-001" },
    ),
    {
      ledgerId: 3,
      accountId: 7,
      amount: 12.5,
      merchant: "便利店",
      type: "支出",
      externalId: "phone-event-001",
      time: undefined,
      category: undefined,
      incomeCategory: undefined,
      text: undefined,
      source: undefined,
    },
  );
  assert.equal(
    parseExternalTransactionInput(
      { ledgerId: 1, text: "微信支付 ¥12.00", externalId: "notice-0001" },
      { requireLedgerId: true, requireIdempotencyKey: true },
    ).text,
    "微信支付 ¥12.00",
  );
});

test("external transaction validation rejects unsafe amounts, enums, ids and oversized text", () => {
  for (const payload of [
    { ledgerId: -1, amount: 1, externalId: "event-0001" },
    { ledgerId: 1, amount: 100_000_001, externalId: "event-0001" },
    { ledgerId: 1, amount: 1, type: "退款", externalId: "event-0001" },
    { ledgerId: 1, amount: 1, externalId: "bad id" },
    { ledgerId: 1, text: "x".repeat(4_001), externalId: "event-0001" },
  ])
    assert.throws(
      () => parseExternalTransactionInput(payload, { requireLedgerId: true, requireIdempotencyKey: true }),
      (error) => error.status === 422,
    );
  const webhook = readFileSync(new URL("../app/api/v1/webhook/auto-parse/route.ts", import.meta.url), "utf8");
  assert.match(webhook, /MAX_ACCOUNT_COUNT/u);
  assert.match(webhook, /FROM accounts WHERE ledger_id=\? ORDER BY id LIMIT \?/u);
});

test("v1 timestamps require an explicit timezone", () => {
  assert.throws(
    () => parseExternalTransactionInput(
      { ledgerId: 1, amount: 1, externalId: "event-0001", time: "2026-08-16T09:00" },
      { requireLedgerId: true, requireIdempotencyKey: true, strictDateTime: true },
    ),
    (error) => error.code === "validation_failed" && error.details?.field === "time",
  );
});
