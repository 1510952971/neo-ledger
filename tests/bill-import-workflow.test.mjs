import assert from "node:assert/strict";
import test from "node:test";
import { runBillImportWorkflow } from "../app/bill-import-workflow.ts";

const response = (status, data) => ({ response: new Response(null, { status }), data });
const file = (name) => new File(["statement"], name, { type: "text/csv" });

function parsed(items, failures = []) {
  return {
    statements: [{
      fileName: "bank.csv",
      statement: {
        sourceName: "银行账单",
        items,
        totalRows: items.length + 1,
        skipped: 1,
        filtered: 1,
        unconfirmed: 0,
        truncated: 0,
      },
    }],
    failures,
  };
}

test("bill import workflow reports empty parser results without previewing", async () => {
  let previewed = false;
  const result = await runBillImportWorkflow({
    files: [file("empty.csv")],
    ledgerId: 7,
    parseFiles: async () => ({ statements: [], failures: [{ fileName: "empty.csv", error: "格式不支持" }] }),
    preview: async () => {
      previewed = true;
      return response(200, {});
    },
    partition: () => ({ automatic: [], review: [] }),
    submitRows: async () => ({ imported: 0 }),
    reloadAccounts: async () => undefined,
  });
  assert.equal(result.kind, "empty");
  assert.equal(result.error, "empty.csv：格式不支持");
  assert.equal(previewed, false);
});

test("bill import workflow builds reconciliation summary and preserves failed files", async () => {
  const items = [{ accountId: 0, possibleDuplicate: false, amount: 100 }];
  const result = await runBillImportWorkflow({
    files: [file("bank.csv")],
    ledgerId: 7,
    parseFiles: async () => parsed(items, [{ fileName: "bad.csv", error: "无法读取" }]),
    preview: async (ledgerId, previewItems) => {
      assert.equal(ledgerId, 7);
      assert.deepEqual(previewItems, items);
      return response(200, { items, detected: 1, duplicates: 2 });
    },
    partition: (rows) => ({ automatic: [], review: rows }),
    submitRows: async () => ({ imported: 0 }),
    reloadAccounts: async () => undefined,
  });
  assert.equal(result.kind, "ready");
  assert.equal(result.summary.detected, 1);
  assert.equal(result.summary.duplicates, 2);
  assert.equal(result.summary.filtered, 3);
  assert.equal(result.failuresMessage, "1 个文件未加入：bad.csv（无法读取）");
  assert.deepEqual(result.reviewItems, items);
});

test("bill import workflow auto-imports mapped rows and leaves review rows", async () => {
  const automatic = { accountId: 4, possibleDuplicate: false, amount: 100 };
  const review = { accountId: 0, possibleDuplicate: false, amount: 200 };
  const statuses = [];
  let reloads = 0;
  const result = await runBillImportWorkflow({
    files: [file("bank.csv")],
    ledgerId: 7,
    parseFiles: async (_files, onStatus) => {
      onStatus("正在读取");
      return parsed([automatic, review]);
    },
    preview: async () => response(200, { items: [automatic, review] }),
    partition: () => ({ automatic: [automatic], review: [review] }),
    submitRows: async (rows) => {
      assert.deepEqual(rows, [automatic]);
      return { imported: 1 };
    },
    reloadAccounts: async () => { reloads += 1; },
    onStatus: (value) => statuses.push(value),
  });
  assert.equal(result.kind, "ready");
  assert.equal(result.autoImported, 1);
  assert.equal(result.summary.pending, 1);
  assert.deepEqual(result.reviewItems, [review]);
  assert.equal(reloads, 1);
  assert.match(statuses.at(-1), /自动导入 1 笔/u);
});

test("bill import workflow preserves all rows when automatic submission fails", async () => {
  const items = [{ accountId: 4, possibleDuplicate: false, amount: 100 }];
  let reloads = 0;
  const result = await runBillImportWorkflow({
    files: [file("bank.csv")],
    ledgerId: 7,
    parseFiles: async () => parsed(items),
    preview: async () => response(200, { items }),
    partition: (rows) => ({ automatic: rows, review: [] }),
    submitRows: async () => null,
    reloadAccounts: async () => { reloads += 1; },
  });
  assert.equal(result.kind, "automatic-failed");
  assert.deepEqual(result.items, items);
  assert.deepEqual(result.reviewItems, items);
  assert.equal(result.summary.autoImported, 0);
  assert.equal(reloads, 0);
});
