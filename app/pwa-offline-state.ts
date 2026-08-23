"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function isLocalPreviewHost(hostname: string) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}
export function neoLedgerCacheKeys(keys: string[]) {
  return keys.filter((key) => key.startsWith("neo-ledger-"));
}

export function createOfflineSyncGate() {
  let active = false;
  return {
    begin() {
      if (active) return false;
      active = true;
      return true;
    },
    end() {
      active = false;
    },
  };
}

export function usePwaOfflineState(input: {
  listOffline: () => Promise<unknown[]>;
  syncOffline: () => Promise<number>;
}) {
  const { listOffline, syncOffline } = input;
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const syncGate = useRef(createOfflineSyncGate());
  const runSync = useCallback(async () => {
    const gate = syncGate.current;
    if (!gate.begin()) return null;
    try {
      return await syncOffline();
    } finally {
      gate.end();
    }
  }, [syncOffline]);
  const syncOfflineEvent = useEffectEvent(async () => {
    const count = await runSync();
    if (count !== null) setOfflineCount(count);
  });
  const syncNow = useCallback(async () => {
    const count = await runSync();
    if (count !== null) setOfflineCount(count);
  }, [runSync]);
  const refreshCount = useCallback(async () => setOfflineCount((await listOffline()).length), [listOffline]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      if (isLocalPreviewHost(window.location.hostname)) {
        void Promise.all([
          navigator.serviceWorker.getRegistrations().then((items) => Promise.all(items.map((item) => item.unregister()))),
          "caches" in window ? caches.keys().then((keys) => Promise.all(neoLedgerCacheKeys(keys).map((key) => caches.delete(key)))) : Promise.resolve([]),
        ]).then(() => {
          const cleanupKey = "neo-ledger-local-cache-cleaned-v6";
          if (!sessionStorage.getItem(cleanupKey)) {
            sessionStorage.setItem(cleanupKey, "1");
            window.location.reload();
          }
        });
      } else {
        void navigator.serviceWorker.register("/service-worker.js", { updateViaCache: "none" });
      }
    }
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const online = () => { setIsOnline(true); void syncOfflineEvent(); };
    const offline = () => setIsOnline(false);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const frame = window.requestAnimationFrame(() => {
      setIsOnline(navigator.onLine);
      void refreshCount();
      if (navigator.onLine) void syncOfflineEvent();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [refreshCount]);

  const install = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    if ((await installPrompt.userChoice).outcome === "accepted") setInstallPrompt(null);
  }, [installPrompt]);

  return { installPrompt, offlineCount, isOnline, install, syncNow, refreshCount };
}
