import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");
const section = readFileSync(new URL("../app/analytics-section.tsx", import.meta.url), "utf8");

test("analytics domain is composed as a presentational section", () => {
  assert.match(page, /<AnalyticsSection\b/u);
  assert.match(page, /insights=\{insights\}/u);
  assert.match(page, /onSaveFire=\{saveFire\}/u);
  assert.match(page, /onStressEventsChange=\{setStressEvents\}/u);
  assert.doesNotMatch(page, /<section className="analytics-page">/u);
});

test("analytics section keeps chart refs and financial warnings behind explicit props", () => {
  for (const name of ["lineCanvas", "pieCanvas", "moodCanvas", "forecastCanvas", "formatMoney"]) {
    assert.match(section, new RegExp(name, "u"));
  }
  for (const text of ["FIRE 赛博退休终极航线", "未来现金流预测", "资金测试沙盘", "综合税筹", "不构成投资建议"]) {
    assert.match(section, new RegExp(text, "u"));
  }
  assert.match(section, /onStressEventsChange\(\{ \.\.\.stressEvents, \[key\]: checked \}\)/u);
  assert.match(section, /action=\{onSaveFire\}/u);
});
