import assert from "node:assert/strict";
import test from "node:test";
import {
  isLedgerRefreshRequestCurrent,
  keepActiveSelection,
} from "../app/ledger-refresh.ts";

test("ledger refresh keeps an active category selection", () => {
  assert.equal(
    keepActiveSelection("餐饮", [{ name: "餐饮", isActive: true }, { name: "旅行", isActive: true }], "默认"),
    "餐饮",
  );
});

test("ledger refresh falls back when a category was disabled or removed", () => {
  assert.equal(
    keepActiveSelection("旧分类", [{ name: "停用", isActive: false }, { name: "新分类", isActive: true }], "默认"),
    "新分类",
  );
  assert.equal(keepActiveSelection("旧分类", [], "默认"), "默认");
});

test("ledger refresh rejects stale or aborted request state writes", () => {
  const first = {
    ledgerId: 1,
    generation: 0,
    controller: new AbortController(),
  };
  const second = {
    ledgerId: 2,
    generation: 1,
    controller: new AbortController(),
  };

  assert.equal(isLedgerRefreshRequestCurrent(first, first), true);
  assert.equal(isLedgerRefreshRequestCurrent(first, second), false);
  first.controller.abort("ledger changed");
  assert.equal(isLedgerRefreshRequestCurrent(first, first), false);
});
