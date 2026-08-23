"use client";

import { useEffect, useEffectEvent } from "react";
import { shouldRunCloudSync } from "./cloud-sync-core.js";

export type WebDavAutoSyncConfig = {
  autoSync: boolean;
  intervalMinutes: number;
  url: string;
  username: string;
  password: string;
  secret: string;
};

type RunAutomaticSync = (
  mode: "smart",
  config: Pick<WebDavAutoSyncConfig, "url" | "username" | "password" | "secret">,
  automatic: true,
) => Promise<unknown> | unknown;

export function parseWebDavLastSyncAt(value: string | null) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function readWebDavLastSyncAt() {
  try {
    return parseWebDavLastSyncAt(localStorage.getItem("neo-webdav-last-sync"));
  } catch {
    // Safari private mode and hardened storage policies can throw on access;
    // an unavailable timestamp must cause a safe due-check, not break the UI.
    return 0;
  }
}

/**
 * Owns the browser-only WebDAV auto-sync lifecycle. Keeping timers, online/
 * focus listeners and localStorage out of the page component makes the sync
 * side effect independently auditable and prevents duplicate subscriptions.
 */
export function useWebDavAutoSync(input: {
  browserStateReady: boolean;
  config: WebDavAutoSyncConfig;
  runSync: RunAutomaticSync;
}) {
  const {
    browserStateReady,
    config: { autoSync, intervalMinutes, url, username, password, secret },
  } = input;
  const runSync = useEffectEvent(input.runSync);

  useEffect(() => {
    if (
      !browserStateReady ||
      !autoSync ||
      !url ||
      !password ||
      secret.length < 8
    )
      return;

    const runIfDue = () => {
      const lastSyncAt = readWebDavLastSyncAt();
      if (
        !shouldRunCloudSync({
          enabled: autoSync,
          online: navigator.onLine,
          url,
          password,
          secret,
          intervalMinutes,
          lastSyncAt,
          now: Date.now(),
        })
      )
        return;

      void runSync(
        "smart",
        {
          url,
          username,
          password,
          secret,
        },
        true,
      );
    };

    runIfDue();
    const timer = window.setInterval(runIfDue, 30_000);
    window.addEventListener("focus", runIfDue);
    window.addEventListener("online", runIfDue);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", runIfDue);
      window.removeEventListener("online", runIfDue);
    };
  }, [
    browserStateReady,
    autoSync,
    intervalMinutes,
    url,
    username,
    password,
    secret,
  ]);
}
