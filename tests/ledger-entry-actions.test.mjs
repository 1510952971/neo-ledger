import assert from "node:assert/strict";
import test from "node:test";
import { createEntrySubmissionGate, decorateEntryFormData, parsedEntryFormData } from "../app/ledger-entry-actions.ts";

test("entry payload decorates expense splits without changing unrelated fields", () => {
  const form = new FormData();
  form.set("title", "午餐");
  decorateEntryFormData({
    formData: form,
    ledgerId: 3,
    entryType: "支出",
    accountId: 8,
    originalTimezone: "Asia/Shanghai",
    mood: "刚需",
    category: "餐饮",
    incomeCategory: "薪资发放",
    splitMode: "按比例平摊",
    splitMemberId: 9,
    mySharePercent: 40,
  });
  assert.equal(form.get("title"), "午餐");
  assert.equal(form.get("ledgerId"), "3");
  assert.equal(form.get("splitWithMemberId"), "9");
  assert.equal(form.get("mySharePercent"), "40");
  assert.equal(form.get("incomeCategory"), null);
});

test("parsed entry payload sets the correct category branch", () => {
  const form = parsedEntryFormData({
    amount: "88",
    title: "工资",
    type: "收入",
    category: "餐饮",
    incomeCategory: "薪资发放",
    mood: "刚需",
    accountId: 2,
  });
  assert.equal(form.get("incomeCategory"), "薪资发放");
  assert.equal(form.get("category"), null);
});

test("entry payload normalizes fixed split modes to deterministic shares", () => {
  for (const [splitMode, expected] of [
    ["全额由我支付", "0"],
    ["全额由对方支付", "100"],
  ]) {
    const form = new FormData();
    decorateEntryFormData({
      formData: form,
      ledgerId: 1,
      entryType: "支出",
      accountId: 1,
      originalTimezone: "Asia/Shanghai",
      mood: "刚需",
      category: "其他",
      incomeCategory: "薪资发放",
      splitMode,
      splitMemberId: 2,
      mySharePercent: 50,
    });
    assert.equal(form.get("mySharePercent"), expected);
  }
});

test("entry submission gate rejects duplicate online or parsed submissions until the first settles", () => {
  const gate = createEntrySubmissionGate();
  assert.equal(gate.begin(), true);
  assert.equal(gate.begin(), false);
  gate.end();
  assert.equal(gate.begin(), true);
});
