import assert from "node:assert/strict";
import test from "node:test";
import { billImportReducer, initialBillImportState } from "../app/bill-import-state.ts";

test("beginning a bill import resets every transient review field atomically", () => {
  const current = {
    items: [{ id: 1 }], error: "旧错误", status: "旧状态", summary: { detected: 1 },
    batches: [{ id: "history" }], manualAccountKeys: ["wechat"], accountActionKey: "wechat",
  };
  assert.deepEqual(billImportReducer(current, { type: "begin" }), {
    items: [], error: "", status: "正在读取账单文件…", summary: null,
    batches: [{ id: "history" }], manualAccountKeys: [], accountActionKey: "",
  });
});

test("bill import field transitions support functional updates", () => {
  const initial = initialBillImportState();
  const withItems = billImportReducer(initial, { type: "field", key: "items", value: [{ id: 1 }] });
  const appended = billImportReducer(withItems, { type: "field", key: "items", value: (rows) => [...rows, { id: 2 }] });
  assert.deepEqual(appended.items, [{ id: 1 }, { id: 2 }]);
  assert.equal(appended.error, "");
});
