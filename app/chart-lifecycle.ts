"use client";

import { useEffect } from "react";

export type ChartInstance = { destroy: () => void };
export type ChartConstructor = new (
  context: CanvasRenderingContext2D,
  config: object,
) => ChartInstance;
type CanvasRef = { current: HTMLCanvasElement | null };
type ChartMeta = Record<string, { emoji: string; color: string }>;
export type ChartAnalysis = {
  categoryData: { name: string; amount: number }[];
  moodData: { name: string; amount: number }[];
  incomeData: { name: string; amount: number }[];
  trend: { label: string; expense: number; income: number }[];
};
export type ChartForecast = {
  points: { label: string; balance: number; danger: boolean }[];
};

function contextFor(canvas: CanvasRef) {
  return canvas.current?.getContext("2d") ?? null;
}

export function createLedgerCharts(input: {
  Chart: ChartConstructor;
  pieCanvas: CanvasRef;
  moodCanvas: CanvasRef;
  lineCanvas: CanvasRef;
  forecastCanvas: CanvasRef;
  analysis: ChartAnalysis;
  categoryMeta: ChartMeta;
  incomeMeta: ChartMeta;
  moodMeta: ChartMeta;
  forecast: ChartForecast | null;
  inflationBps: number;
  theme: string;
}) {
  const { Chart, analysis, categoryMeta, incomeMeta, moodMeta, forecast } = input;
  const charts: ChartInstance[] = [];
  const chartText = input.theme === "obsidian" ? "#eaffdf" : "#655e55";
  const tooltip = {
    backgroundColor: "rgba(49,47,43,.94)",
    padding: 12,
    cornerRadius: 10,
    displayColors: true,
    titleFont: { size: 11 },
    bodyFont: { size: 11 },
  };
  const common = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: true },
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          color: chartText,
          usePointStyle: true,
          padding: 16,
          font: { family: "sans-serif", size: 10 },
        },
      },
      tooltip,
    },
  };
  try {
  const pieContext = contextFor(input.pieCanvas);
  if (pieContext)
    charts.push(new Chart(pieContext, {
      type: "doughnut",
      data: {
        labels: analysis.categoryData.map((item) => `${categoryMeta[item.name].emoji} ${item.name}`),
        datasets: [
          {
            label: "支出分类",
            data: analysis.categoryData.map((item) => item.amount / 100),
            backgroundColor: analysis.categoryData.map((item) => categoryMeta[item.name].color),
            borderWidth: 3,
            borderColor: "#fffdf8",
            hoverOffset: 10,
            weight: 1.25,
          },
          {
            label: "消费情绪",
            data: analysis.moodData.map((item) => item.amount / 100),
            backgroundColor: analysis.moodData.map((item) => moodMeta[item.name].color),
            borderWidth: 3,
            borderColor: "#fffdf8",
            hoverOffset: 8,
            weight: 0.8,
          },
        ],
      },
      options: { ...common, cutout: "42%", animation: { duration: 850, easing: "easeOutQuart" } },
    }));
  const moodContext = contextFor(input.moodCanvas);
  if (moodContext)
    charts.push(new Chart(moodContext, {
      type: "doughnut",
      data: {
        labels: analysis.incomeData.map((item) => `${incomeMeta[item.name].emoji} ${item.name}`),
        datasets: [{
          label: "收入来源",
          data: analysis.incomeData.map((item) => item.amount / 100),
          backgroundColor: analysis.incomeData.map((item) => incomeMeta[item.name].color),
          borderWidth: 3,
          borderColor: "#fffdf8",
          hoverOffset: 12,
        }],
      },
      options: { ...common, cutout: "65%", animation: { duration: 850, easing: "easeOutQuart" } },
    }));
  const lineContext = contextFor(input.lineCanvas);
  if (lineContext) {
    const orange = lineContext.createLinearGradient(0, 0, 0, 240);
    orange.addColorStop(0, "rgba(225,124,91,.42)");
    orange.addColorStop(1, "rgba(225,124,91,0)");
    const green = lineContext.createLinearGradient(0, 0, 0, 240);
    green.addColorStop(0, "rgba(77,157,116,.38)");
    green.addColorStop(1, "rgba(77,157,116,0)");
    charts.push(new Chart(lineContext, {
      type: "line",
      data: {
        labels: analysis.trend.map((item) => item.label),
        datasets: [
          {
            label: "总支出",
            data: analysis.trend.map((item) => item.expense / 100),
            borderColor: "#e17c5b",
            backgroundColor: orange,
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 7,
            pointBackgroundColor: "#e17c5b",
            borderWidth: 2.5,
          },
          {
            label: "总收入",
            data: analysis.trend.map((item) => item.income / 100),
            borderColor: "#4d9d74",
            backgroundColor: green,
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 7,
            pointBackgroundColor: "#4d9d74",
            borderWidth: 2.5,
          },
        ],
      },
      options: {
        ...common,
        interaction: { mode: "index", intersect: false },
        scales: {
          y: { beginAtZero: true, grid: { color: "rgba(70,55,40,.06)" }, border: { display: false } },
          x: { grid: { display: false }, border: { display: false } },
        },
      },
    }));
  }
  const forecastContext = contextFor(input.forecastCanvas);
  if (forecastContext && forecast) {
    const gradient = forecastContext.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, "rgba(112,170,137,.42)");
    gradient.addColorStop(1, "rgba(112,170,137,0)");
    charts.push(new Chart(forecastContext, {
      type: "line",
      data: {
        labels: forecast.points.map((item) => item.label),
        datasets: [
          {
            label: "预测净资产",
            data: forecast.points.map((item) => item.balance / 100),
            borderColor: forecast.points.map((item) => item.danger ? "#ef5e56" : "#65a77f"),
            backgroundColor: gradient,
            pointBackgroundColor: forecast.points.map((item) => item.danger ? "#ef5e56" : "#65a77f"),
            pointRadius: forecast.points.map((item) => item.danger ? 6 : 3),
            fill: true,
            tension: 0.4,
            borderWidth: 3,
          },
          {
            label: "真实购买力资产",
            data: forecast.points.map((item, index) => item.balance / Math.pow(1 + input.inflationBps / 10000, index / 12) / 100),
            borderColor: "#8f83aa",
            backgroundColor: "transparent",
            borderDash: [6, 5],
            pointRadius: 2,
            fill: false,
            tension: 0.4,
            borderWidth: 2,
          },
        ],
      },
      options: {
        ...common,
        interaction: { mode: "index", intersect: false },
        scales: {
          y: { grid: { color: "rgba(100,90,70,.08)" }, ticks: { color: chartText } },
          x: { grid: { display: false }, ticks: { color: chartText, maxRotation: 0 } },
        },
      },
    }));
  }
    return charts;
  } catch (error) {
    charts.forEach((chart) => {
      try {
        chart.destroy();
      } catch {
        // Preserve the original Chart.js failure while best-effort cleaning up.
      }
    });
    throw error;
  }
}

export function useLedgerCharts(input: {
  chartReady: boolean;
  tab: string;
  theme: string;
  analysis: ChartAnalysis;
  categoryMeta: ChartMeta;
  incomeMeta: ChartMeta;
  moodMeta: ChartMeta;
  forecast: ChartForecast | null;
  inflationBps: number;
  pieCanvas: CanvasRef;
  moodCanvas: CanvasRef;
  lineCanvas: CanvasRef;
  forecastCanvas: CanvasRef;
}) {
  const {
    chartReady,
    tab,
    theme,
    analysis,
    categoryMeta,
    incomeMeta,
    moodMeta,
    forecast,
    inflationBps,
    pieCanvas,
    moodCanvas,
    lineCanvas,
    forecastCanvas,
  } = input;
  useEffect(() => {
    if (!chartReady || tab !== "analytics" || typeof window === "undefined" || !window.Chart) return;
    const charts = createLedgerCharts({
      Chart: window.Chart,
      pieCanvas,
      moodCanvas,
      lineCanvas,
      forecastCanvas,
      analysis,
      categoryMeta,
      incomeMeta,
      moodMeta,
      forecast,
      inflationBps,
      theme,
    });
    return () => charts.forEach((chart) => chart.destroy());
  }, [analysis, chartReady, categoryMeta, forecast, forecastCanvas, incomeMeta, inflationBps, lineCanvas, moodCanvas, moodMeta, pieCanvas, tab, theme]);
}
