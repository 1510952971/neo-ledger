import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeScreenshotRecognition,
  redactScreenshotRecognitionText,
} from "../app/screenshot-recognition-core.js";

test("server-side OCR redaction hides personal identifiers and keeps bill fields", () => {
  const result = redactScreenshotRecognitionText(
    "支付成功\n金额：¥ 18.80\n联系电话：13800138000\n订单号：420000123456789\n收货地址：北京市朝阳区某某路",
  );
  assert.match(result, /¥ 18\.80/u);
  assert.match(result, /\[手机号已隐藏\]/u);
  assert.match(result, /订单号：\[编号已隐藏\]/u);
  assert.match(result, /收货地址：\[地址已隐藏\]/u);
  assert.doesNotMatch(result, /13800138000|420000123456789|朝阳区/u);
});

test("recognition metadata is bounded, normalized, and correction keys are allow-listed", () => {
  const result = normalizeScreenshotRecognition({
    source: "截图本地识别".repeat(20),
    recognitionCompleteness: 120,
    recognitionText: "金额：¥ 9.90\n手机号：13800138000",
    recognitionCorrections: {
      amount: { recognized: "9.90", confirmed: "19.90" },
      arbitrary: { recognized: "secret", confirmed: "leak" },
      title: { recognized: "店铺", confirmed: "我的店铺 13800138000" },
    },
  });
  assert.equal(result.source.length, 60);
  assert.equal(result.recognitionCompleteness, 100);
  assert.doesNotMatch(result.recognitionText, /13800138000/u);
  const corrections = JSON.parse(result.recognitionCorrectionsJson);
  assert.deepEqual(Object.keys(corrections).sort(), ["amount", "title"]);
  assert.doesNotMatch(JSON.stringify(corrections), /13800138000/u);
  assert.equal(normalizeScreenshotRecognition({ recognitionCompleteness: -10 }).recognitionCompleteness, 0);
  assert.equal(normalizeScreenshotRecognition({}).recognitionText, null);
});
