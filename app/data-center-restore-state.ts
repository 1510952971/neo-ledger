import { useEffect, useState } from "react";
import { loadRestoreSnapshots } from "./restore-actions.ts";

export type RestoreSnapshot = {
  id: string;
  createdAt: string;
  checksum: string;
  totalBytes: number;
  chunkCount: number;
};

export type SyncConflictReport = {
  conflictCount: number;
  truncated: number;
  conflicts: Array<{
    table: string;
    syncId: string;
    localTimestamp: string;
    remoteTimestamp: string;
    winner: "local" | "remote";
    local: Record<string, unknown>;
    remote: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
};

export { restoreSnapshotUrl } from "./restore-actions.ts";

export function normalizeRestoreSnapshots(value: unknown): RestoreSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RestoreSnapshot => {
    if (!item || typeof item !== "object") return false;
    const snapshot = item as Partial<RestoreSnapshot>;
    const totalBytes = snapshot.totalBytes;
    const chunkCount = snapshot.chunkCount;
    return (
      typeof snapshot.id === "string" &&
      typeof snapshot.createdAt === "string" &&
      typeof snapshot.checksum === "string" &&
      typeof totalBytes === "number" &&
      Number.isFinite(totalBytes) &&
      typeof chunkCount === "number" &&
      Number.isFinite(chunkCount) &&
      totalBytes >= 0 &&
      chunkCount >= 0
    );
  });
}

export function parseSavedMergeReport(value: string | null): SyncConflictReport | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SyncConflictReport>;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Number.isFinite(parsed.conflictCount) || !Number.isFinite(parsed.truncated)) return null;
    if (!Array.isArray(parsed.conflicts)) return null;
    return parsed as SyncConflictReport;
  } catch {
    return null;
  }
}

type RestoreStateOptions = { active: boolean };

export function useDataCenterRestoreState({ active }: RestoreStateOptions) {
  const [restoreSnapshots, setRestoreSnapshots] = useState<RestoreSnapshot[]>([]);
  const [lastMergeReport, setLastMergeReport] = useState<SyncConflictReport | null>(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const frames = new Set<number>();
    const schedule = (callback: () => void) => {
      const frame = window.requestAnimationFrame(() => {
        frames.delete(frame);
        if (!controller.signal.aborted) callback();
      });
      frames.add(frame);
    };
    let saved: SyncConflictReport | null = null;
    try {
      saved = parseSavedMergeReport(localStorage.getItem("neo-last-merge-report"));
    } catch {
      saved = null;
    }
    schedule(() => setLastMergeReport(saved));
    loadRestoreSnapshots({ signal: controller.signal })
      .then(({ response, data }) => {
        if (!response.ok) return [] as RestoreSnapshot[];
        return normalizeRestoreSnapshots(data);
      })
      .then((snapshots) => {
        if (controller.signal.aborted) return;
        schedule(() => setRestoreSnapshots(snapshots));
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        schedule(() => setRestoreSnapshots([]));
      });
    return () => {
      controller.abort();
      for (const frame of frames) window.cancelAnimationFrame(frame);
    };
  }, [active]);

  return { restoreSnapshots, lastMergeReport, setLastMergeReport };
}
