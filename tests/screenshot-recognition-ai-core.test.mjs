import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeScreenshotRecognitionAiRequest,
  normalizeScreenshotRecognitionAiResponse,
} from "../app/screenshot-recognition-ai-core.js";

test("AI screenshot request requires per-request consent and accepts only redacted text", () => {
  assert.equal(normalizeScreenshotRecognitionAiRequest({ text: "支付成功" }), null);
  assert.equal(normalizeScreenshotRecognitionAiRequest({ consent: true, text: "凭证", image: "data:image/png;base64,secret" }), null);
  const normalized = normalizeScreenshotRecognitionAiRequest({
    consent: true,
    text: "支付成功\n金额：¥18.80\n联系电话：13800138000",
  });
  assert.equal(normalized.text.includes("13800138000"), false);
  assert.match(normalized.text, /\[手机号已隐藏\]/u);
  assert.equal(normalizeScreenshotRecognitionAiRequest({ consent: true, text: "\n  " }), null);
});

test("AI response is parsed to bounded bill fields and rejects invalid dates and amounts", () => {
  const result = normalizeScreenshotRecognitionAiResponse({
    message: {
      content: JSON.stringify({
        amount: "18.8",
        title: "店铺\n手机号 13800138000",
        type: "支出",
        category: "餐饮",
        occurredAt: "2026-09-13",
        accountId: 1,
        note: "不要返回的字段",
      }),
    },
  });
  assert.deepEqual(result, {
    amount: 18.8,
    title: "店铺 手机号 [手机号已隐藏]",
    type: "支出",
    category: "餐饮",
    occurredAt: "2026-09-13T00:00:00.000Z",
  });
  assert.equal(normalizeScreenshotRecognitionAiResponse({ response: '{"amount":-5,"type":"转账"}' }), null);
  assert.equal(normalizeScreenshotRecognitionAiResponse({ response: '{"occurredAt":"2026-02-30"}' }), null);
  assert.equal(normalizeScreenshotRecognitionAiResponse({ response: "not json" }), null);
});
