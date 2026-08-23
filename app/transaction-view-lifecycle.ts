"use client";

import { useEffect, useEffectEvent } from "react";

export function useTransactionViewLifecycle(input: {
  transactions: unknown[];
  refresh: () => void | Promise<unknown>;
}) {
  const { transactions, refresh: refreshTask } = input;
  const refresh = useEffectEvent(refreshTask);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [transactions]);
}
