import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSET_PAGE_SIZE,
  BILL_PAGE_SIZE,
  COLLECTION_PAGE_SIZE,
  paginateBills,
} from "../app/bill-pagination.js";
import { collectionPageOptions } from "../app/collection-pagination-core.js";

test("shows at most twenty bills on each page", () => {
  const rows = Array.from({ length: 45 }, (_, index) => index + 1);
  const first = paginateBills(rows, 1);
  const second = paginateBills(rows, 2);
  const third = paginateBills(rows, 3);
  assert.equal(BILL_PAGE_SIZE, 20);
  assert.deepEqual(first.rows, rows.slice(0, 20));
  assert.deepEqual(second.rows, rows.slice(20, 40));
  assert.deepEqual(third.rows, rows.slice(40));
  assert.equal(third.totalPages, 3);
  assert.equal(third.totalRows, 45);
});

test("clamps deleted or invalid bill pages to a valid page", () => {
  const rows = Array.from({ length: 21 }, (_, index) => index + 1);
  assert.equal(paginateBills(rows, 99).page, 2);
  assert.equal(paginateBills(rows, -2).page, 1);
  assert.equal(paginateBills([], 8).page, 1);
  assert.deepEqual(paginateBills([], 8).rows, []);
});

test("shows ten tracked assets on each asset page", () => {
  const rows = Array.from({ length: 24 }, (_, index) => index + 1);
  const first = paginateBills(rows, 1, ASSET_PAGE_SIZE);
  const third = paginateBills(rows, 3, ASSET_PAGE_SIZE);

  assert.equal(ASSET_PAGE_SIZE, 10);
  assert.deepEqual(first.rows, rows.slice(0, 10));
  assert.deepEqual(third.rows, rows.slice(20));
  assert.equal(third.totalPages, 3);
  assert.equal(third.totalRows, 24);
});

test("keeps every addable management collection to ten rows per page", () => {
  const collections = [
    "我的续费",
    "分期付款",
    "心愿储蓄罐",
    "分账搭子",
    "品类预算",
  ];
  const rows = Array.from({ length: 21 }, (_, index) => index + 1);

  assert.equal(COLLECTION_PAGE_SIZE, 10);
  for (const name of collections) {
    const second = paginateBills(rows, 2, COLLECTION_PAGE_SIZE);
    assert.equal(second.rows.length, 10, name);
    assert.deepEqual(second.rows, rows.slice(10, 20), name);
    assert.equal(second.totalPages, 3, name);
  }
});

test("large page counts keep the page selector bounded", () => {
  const options = collectionPageOptions(25_000, 50_000);
  assert.ok(options.length <= 200);
  assert.ok(options.includes(1));
  assert.ok(options.includes(25_000));
  assert.ok(options.includes(50_000));
});
