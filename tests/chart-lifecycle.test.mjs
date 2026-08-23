import assert from "node:assert/strict";
import test from "node:test";
import { createLedgerCharts } from "../app/chart-lifecycle.ts";

function canvas() {
  return {
    current: {
      getContext: () => ({
        createLinearGradient: () => ({ addColorStop() {} }),
      }),
    },
  };
}

test("chart factory creates every configured chart and cleanup destroys each instance", () => {
  const configs = [];
  const destroyed = [];
  class Chart {
    constructor(_context, config) {
      configs.push(config);
      this.destroy = () => destroyed.push(config.type);
    }
  }
  const charts = createLedgerCharts({
    Chart,
    pieCanvas: canvas(),
    moodCanvas: canvas(),
    lineCanvas: canvas(),
    forecastCanvas: canvas(),
    analysis: {
      categoryData: [{ name: "餐饮", amount: 1000 }],
      moodData: [{ name: "刚需", amount: 1000 }],
      incomeData: [{ name: "薪资发放", amount: 2000 }],
      trend: [{ label: "今天", expense: 1000, income: 2000 }],
    },
    categoryMeta: { 餐饮: { emoji: "🍔", color: "#e85" } },
    incomeMeta: { 薪资发放: { emoji: "💼", color: "#4d9" } },
    moodMeta: { 刚需: { emoji: "🧾", color: "#999" } },
    forecast: { points: [{ label: "今天", balance: 10000, danger: false }] },
    inflationBps: 250,
    theme: "cream",
  });
  assert.equal(charts.length, 4);
  assert.deepEqual(configs.map((config) => config.type), ["doughnut", "doughnut", "line", "line"]);
  charts.forEach((chart) => chart.destroy());
  assert.deepEqual(destroyed, ["doughnut", "doughnut", "line", "line"]);
});

test("chart factory tolerates missing canvases and optional forecast", () => {
  const configs = [];
  class Chart {
    constructor(_context, config) { configs.push(config); }
  }
  const charts = createLedgerCharts({
    Chart,
    pieCanvas: { current: null },
    moodCanvas: { current: null },
    lineCanvas: canvas(),
    forecastCanvas: canvas(),
    analysis: { categoryData: [], moodData: [], incomeData: [], trend: [] },
    categoryMeta: {},
    incomeMeta: {},
    moodMeta: {},
    forecast: null,
    inflationBps: 0,
    theme: "cream",
  });
  assert.equal(charts.length, 1);
  assert.equal(configs[0].type, "line");
});

test("chart factory destroys already-created instances when a later chart fails", () => {
  const destroyed = [];
  let created = 0;
  class FailingChart {
    constructor(_context, config) {
      if (created++ === 1) throw new Error("chart constructor failed");
      this.destroy = () => destroyed.push(config.type);
    }
  }
  assert.throws(
    () => createLedgerCharts({
      Chart: FailingChart,
      pieCanvas: canvas(),
      moodCanvas: canvas(),
      lineCanvas: canvas(),
      forecastCanvas: canvas(),
      analysis: { categoryData: [{ name: "餐饮", amount: 1000 }], moodData: [{ name: "刚需", amount: 1000 }], incomeData: [{ name: "薪资发放", amount: 2000 }], trend: [{ label: "今天", expense: 1000, income: 2000 }] },
      categoryMeta: { 餐饮: { emoji: "🍔", color: "#e85" } },
      incomeMeta: { 薪资发放: { emoji: "💼", color: "#4d9" } },
      moodMeta: { 刚需: { emoji: "🧾", color: "#999" } },
      forecast: null,
      inflationBps: 250,
      theme: "cream",
    }),
    /chart constructor failed/u,
  );
  assert.deepEqual(destroyed, ["doughnut"]);
});
