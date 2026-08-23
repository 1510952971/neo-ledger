import { useEffect, useState } from "react";

export type RestoreSummary = {
  totalRecords: number;
  restoredByType: Record<string, number>;
  skippedRecords: number;
  errorCount: number;
};

export const restoreResultStorageKey = "neo-restore-result";

export function parseRestoreSummary(value: string | null): RestoreSummary | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<RestoreSummary>;
    if (!parsed || typeof parsed !== "object") return null;
    const totalRecords = parsed.totalRecords;
    const skippedRecords = parsed.skippedRecords;
    const errorCount = parsed.errorCount;
    if (
      typeof totalRecords !== "number" ||
      !Number.isInteger(totalRecords) ||
      totalRecords < 0 ||
      typeof skippedRecords !== "number" ||
      !Number.isInteger(skippedRecords) ||
      skippedRecords < 0 ||
      typeof errorCount !== "number" ||
      !Number.isInteger(errorCount) ||
      errorCount < 0 ||
      !parsed.restoredByType ||
      typeof parsed.restoredByType !== "object" ||
      Array.isArray(parsed.restoredByType)
    )
      return null;
    const restoredByType: Record<string, number> = {};
    for (const [key, count] of Object.entries(parsed.restoredByType)) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,48}$/u.test(key) || !Number.isInteger(count) || count < 0)
        return null;
      restoredByType[key] = count;
    }
    return {
      totalRecords,
      restoredByType,
      skippedRecords,
      errorCount,
    };
  } catch {
    return null;
  }
}

export function useRestoreResult() {
  const [summary, setSummary] = useState<RestoreSummary | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = parseRestoreSummary(sessionStorage.getItem(restoreResultStorageKey));
        sessionStorage.removeItem(restoreResultStorageKey);
        setSummary(saved);
      } catch {
        setSummary(null);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return { summary, dismiss: () => setSummary(null) };
}
