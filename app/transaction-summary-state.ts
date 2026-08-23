"use client";

import { useEffect, useState } from "react";
import { DEFAULT_CLIENT_RESPONSE_BYTES, fetchClientJson } from "./client-api.ts";

export type TransactionSummaryPeriod = {
  income: number;
  expense: number;
  balance: number;
  count: number;
  topCategory: string | null;
  topCategoryAmount: number;
};

export type TransactionSummary = {
  todayKey: string;
  dimension: "日" | "月" | "年";
  analysis: {
    expenseTotal: number;
    incomeTotal: number;
    balance: number;
    savingRate: number;
    categoryData: Array<{ name: string; amount: number }>;
    moodData: Array<{ name: string; amount: number }>;
    incomeData: Array<{ name: string; amount: number }>;
    trend: Array<{ label: string; expense: number; income: number }>;
    impulse: number;
    topCategory: { name: string; amount: number } | null;
    needExpense: number;
    investmentIncome: number;
  };
  dashboard: {
    monthIncome: number;
    monthExpense: number;
    sideIncome: number;
    sideCost: number;
    categorySpend: Array<{ name: string; amount: number }>;
    impulseDates: string[];
    settlements: Array<{ memberId: number; balance: number }>;
  };
  periodReports: {
    daily: TransactionSummaryPeriod;
    nightDaily: TransactionSummaryPeriod;
    nightMonthly: TransactionSummaryPeriod;
    nightYearly: TransactionSummaryPeriod;
    nightDateKey: string;
    isMonthEnd: boolean;
    isYearEnd: boolean;
  };
  availableYears: number[];
};

function validSummary(value: unknown): value is TransactionSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Partial<TransactionSummary>;
  return typeof summary.todayKey === "string" &&
    (summary.dimension === "日" || summary.dimension === "月" || summary.dimension === "年") &&
    Boolean(summary.analysis) && Boolean(summary.periodReports) && Array.isArray(summary.availableYears);
}

export function useTransactionSummary({
  ledgerId,
  todayKey,
  dimension,
  clockTick,
  revision,
}: {
  ledgerId: number;
  todayKey: string;
  dimension: "日" | "月" | "年";
  clockTick: number;
  revision: string;
}) {
  const [loaded, setLoaded] = useState<{ key: string; summary: TransactionSummary } | null>(null);
  const clock = new Date(clockTick || 0);
  const localHour = clockTick ? clock.getHours() : 0;
  const offset = clockTick ? -clock.getTimezoneOffset() : 0;
  const nowIso = clockTick ? clock.toISOString() : "";
  const clockBucket = `${todayKey}:${localHour < 5 ? "night" : "day"}`;
  useEffect(() => {
    if (!todayKey) {
      return;
    }
    const controller = new AbortController();
    const requestKey = `${ledgerId}|${todayKey}|${dimension}|${revision}`;
    const params = new URLSearchParams({
      ledger: String(ledgerId),
      today: todayKey,
      dimension,
      offset: String(offset),
      hour: String(localHour),
      now: nowIso,
    });
    void fetchClientJson<unknown>(`/api/transactions/summary?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    }, DEFAULT_CLIENT_RESPONSE_BYTES).then(({ response, data }) => {
      if (!controller.signal.aborted && response.ok && validSummary(data)) setLoaded({ key: requestKey, summary: data });
    }).catch(() => {
      // The local transaction reducer remains the safe fallback while the
      // server summary is unavailable or the selected ledger is switching.
    });
    return () => controller.abort("summary changed");
  // Minute ticks do not change the summary; only the day/night bucket does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerId, todayKey, dimension, revision, clockBucket]);
  const requestKey = `${ledgerId}|${todayKey}|${dimension}|${revision}`;
  return loaded?.key === requestKey && loaded.summary.todayKey === todayKey && loaded.summary.dimension === dimension
    ? loaded.summary
    : null;
}
