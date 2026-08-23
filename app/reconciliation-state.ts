"use client";

import { useCallback, useEffect, useState } from "react";
import {
  loadReconciliationRows,
  updateReconciliation,
  type ReconciliationRow,
  type ReconciliationStatus,
} from "./reconciliation-actions.ts";

export type { ReconciliationRow, ReconciliationStatus } from "./reconciliation-actions.ts";

export function reconciliationRowsAfterUpdate(current: Record<number, ReconciliationRow>, transactionIds: number[], status: ReconciliationStatus, now: string) {
  const next = { ...current };
  transactionIds.forEach((transactionId) => {
    next[transactionId] = {
      transactionId,
      status,
      note: null,
      reconciledAt: status === "reconciled" ? now : null,
    };
  });
  return next;
}

export function useReconciliationState({ active, ledgerId, transactionIds, refreshKey, onNotify }: {
  active: boolean;
  ledgerId: number;
  transactionIds: number[];
  refreshKey: unknown;
  onNotify: (kind: "success" | "warning", message: string) => void;
}) {
  const [rows, setRows] = useState<Record<number, ReconciliationRow>>({});
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [pending, setPending] = useState(false);
  const transactionIdKey = transactionIds
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .slice(0, 100)
    .join(",");

  useEffect(() => {
    if (!active) return;
    let current = true;
    void loadReconciliationRows({
      ledgerId,
      transactionIds: transactionIdKey ? transactionIdKey.split(",").map(Number) : [],
    })
      .then(({ response, data }) => (response.ok && Array.isArray(data) ? data : []))
      .then((items) => {
        if (current) setRows(Object.fromEntries(items.map((item) => [item.transactionId, item])));
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [active, ledgerId, refreshKey, transactionIdKey]);

  const toggle = useCallback((transactionId: number, selected: boolean) => {
    setSelectedIds((current) =>
      selected
        ? current.includes(transactionId) ? current : [...current, transactionId]
        : current.filter((id) => id !== transactionId),
    );
  }, []);

  const mark = useCallback(async (status: ReconciliationStatus) => {
    if (!selectedIds.length || pending) return;
    const claimedIds = [...selectedIds];
    setPending(true);
    try {
      const { response, data } = await updateReconciliation({
        ledgerId,
        transactionIds: claimedIds,
        status,
      });
      if (!response.ok)
        throw new Error(data?.error || "对账更新失败");
      const now = new Date().toISOString();
      setRows((current) => reconciliationRowsAfterUpdate(current, claimedIds, status, now));
      setSelectedIds([]);
      onNotify("success", `已更新 ${claimedIds.length} 笔流水的对账状态。`);
    } catch (error) {
      onNotify("warning", error instanceof Error ? error.message : "对账更新失败");
    } finally {
      setPending(false);
    }
  }, [ledgerId, onNotify, pending, selectedIds]);

  return { rows, selectedIds, pending, toggle, clear: () => setSelectedIds([]), mark };
}
