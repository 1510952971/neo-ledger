"use client";

import { useEffect, useState } from "react";
import { fetchClientJson } from "./client-api.ts";

export type Forecast = { netWorth: number; averageDailySpend: number; monthlyFixed: number; bankruptcyDate: string | null; runwayDays: number | null; hasSpendingData: boolean; dataStatus: "ok" | "insufficient_data"; points: { label: string; date: string; balance: number; danger: boolean }[] };
export function forecastUrl(ledgerId: number) { return `/api/forecast?ledger=${ledgerId}`; }
export function useForecastState({ active, ledgerId, transactionsKey, subscriptionsKey }: { active: boolean; ledgerId: number; transactionsKey: unknown; subscriptionsKey: unknown }) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void fetchClientJson<Forecast>(forecastUrl(ledgerId), { cache: "no-store", signal: controller.signal })
      .then(({ response, data }) => { if (!controller.signal.aborted) setForecast(response.ok ? data : null); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [active, ledgerId, transactionsKey, subscriptionsKey]);
  return forecast;
}
