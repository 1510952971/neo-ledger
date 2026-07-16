import assert from "node:assert/strict";
import test from "node:test";
import * as xlsx from "@e965/xlsx";
import { parseStatementFile } from "../app/bill-file-parser.ts";

const rows = [
  ["微信支付账单明细"],
  [
    "交易时间",
    "交易类型",
    "交易对方",
    "商品",
    "收/支",
    "金额(元)",
    "支付方式",
    "当前状态",
    "交易单号",
    "商户单号",
    "备注",
  ],
  [
    "2026-07-11 12:30:00",
    "商户消费",
    "测试商户",
    "午餐",
    "支出",
    "18.50",
    "零钱",
    "支付成功",
    "test-order-1",
    "merchant-1",
    "/",
  ],
];

function workbookBytes(bookType) {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.aoa_to_sheet(rows),
    "账单",
  );
  return xlsx.write(workbook, { type: "array", bookType });
}

for (const [name, bookType] of [
  ["Windows Excel .xls", "biff8"],
  ["Excel .xlsx", "xlsx"],
  ["WPS .et", "xlsx"],
]) {
  test(`parses ${name} statement files`, async () => {
    const extension = name.endsWith(".xls")
      ? "xls"
      : name.endsWith(".et")
        ? "et"
        : "xlsx";
    const parsed = await parseStatementFile(
      new File([workbookBytes(bookType)], `账单.${extension}`),
    );
    assert.equal(parsed.source, "wechat");
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].amount, 18.5);
  });
}
