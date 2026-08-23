"use client";

import { useEffect, useState } from "react";

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function ledgerClockValue(now: number) {
  return { clockTick: now, todayKey: localDateKey(new Date(now)) };
}

export function useLedgerClock() {
  const [clock, setClock] = useState({ clockTick: 0, todayKey: "" });
  useEffect(() => {
    const update = () => setClock(ledgerClockValue(Date.now()));
    const frame = window.requestAnimationFrame(update);
    const timer = window.setInterval(update, 60_000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);
  return clock;
}
