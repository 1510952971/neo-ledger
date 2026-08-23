"use client";

import { useEffect, useEffectEvent } from "react";

type LifecycleTask = () => Promise<unknown> | unknown;

/** Loads data-center-only metadata when its dialog becomes visible. */
export function useDataCenterLifecycle(input: {
  active: boolean;
  updateAvailable: boolean;
  checkUpdate: LifecycleTask;
  loadQuickSyncStatus: LifecycleTask;
  loadImportBatches: LifecycleTask;
}) {
  const {
    active,
    updateAvailable,
    checkUpdate: checkUpdateTask,
    loadQuickSyncStatus: loadQuickSyncStatusTask,
    loadImportBatches: loadImportBatchesTask,
  } = input;
  const checkUpdate = useEffectEvent(checkUpdateTask);
  const loadQuickSyncStatus = useEffectEvent(loadQuickSyncStatusTask);
  const loadImportBatches = useEffectEvent(loadImportBatchesTask);

  useEffect(() => {
    if (!active) return;
    if (!updateAvailable) void checkUpdate();
    void loadQuickSyncStatus();
    void loadImportBatches();
  }, [active, updateAvailable]);
}
