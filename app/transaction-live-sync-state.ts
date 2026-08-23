"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_CLIENT_RESPONSE_BYTES, fetchClientJson } from "./client-api.ts";

type TransactionRevisionResponse = {
  revision?: string;
  updatedAt?: string;
};

function transactionMarker(data: TransactionRevisionResponse | null) {
  return JSON.stringify([data?.revision ?? "0", data?.updatedAt ?? ""]);
}

/**
 * Watches the server-side ledger revision so every insert, edit and delete
 * made by another device refreshes the desktop UI without a manual refresh.
 */
export function useTransactionLiveSync({
  ledgerId,
  enabled = true,
  onChanged,
}: {
  ledgerId: number;
  enabled?: boolean;
  onChanged: () => void;
}) {
  const markerRef = useRef<string | null>(null);
  const callbackRef = useRef(onChanged);
  useEffect(() => {
    callbackRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let running = false;

    const poll = async () => {
      if (cancelled || running || document.visibilityState === "hidden" || !navigator.onLine) return;
      running = true;
      try {
        const params = new URLSearchParams({
          ledger: String(ledgerId),
        });
        const { response, data } = await fetchClientJson<TransactionRevisionResponse>(
          `/api/transactions/revision?${params.toString()}`,
          { cache: "no-store" },
          DEFAULT_CLIENT_RESPONSE_BYTES,
        );
        if (!response.ok || cancelled) return;
        const marker = transactionMarker(data);
        if (markerRef.current === null) {
          markerRef.current = marker;
        } else if (marker !== markerRef.current) {
          markerRef.current = marker;
          callbackRef.current();
        }
      } catch {
        // A transient network failure should not interrupt the next poll.
      } finally {
        running = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    const refresh = () => void poll();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, ledgerId]);
}
