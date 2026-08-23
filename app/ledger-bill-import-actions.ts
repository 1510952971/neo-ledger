"use client";

import { useCallback } from "react";
import { fetchClientJson, MAX_BILL_IMPORT_RESPONSE_BYTES } from "./client-api.ts";

type TransitionStarter = (callback: () => void | Promise<void>) => void;
type BatchLike = { id: string; importedCount: number; status?: string; undoStartedAt?: string | null; undoResumable?: boolean | number };

export type BillImportWriteResult = {
  imported?: number;
  duplicates?: number;
  skipped?: number;
  batchId?: string;
  error?: string;
};

export type BillImportPreviewResult<Item> = {
  items?: Item[];
  detected?: number;
  duplicates?: number;
  possibleDuplicates?: number;
  unmapped?: number;
  unconfirmed?: number;
  truncated?: number;
  error?: string;
};

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxBytes?: number,
) => Promise<{ response: Response; data: T | null }>;

export function billImportBatchUrl(ledgerId: number, batchId?: string, resume = false) {
  const query = new URLSearchParams({ ledger: String(ledgerId) });
  if (batchId) query.set("batchId", batchId);
  if (resume) query.set("resume", "1");
  return `/api/bill-import?${query.toString()}`;
}

export function previewBillImport<RequestItem, ResponseItem = RequestItem>(input: {
  ledgerId: number;
  items: RequestItem[];
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<BillImportPreviewResult<ResponseItem>>(
    "/api/bill-import",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ledgerId: input.ledgerId, items: input.items }),
    },
    MAX_BILL_IMPORT_RESPONSE_BYTES,
  );
}

export function cleanBadBillImports(input: {
  ledgerId: number;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ deleted?: number; error?: string }>(
    billImportBatchUrl(input.ledgerId),
    { method: "DELETE" },
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useLedgerBillImportActions<Item, Batch extends BatchLike>({
  ledgerId,
  startTransition,
  setError,
  setBatches,
  confirmAsk,
  notify,
  refreshLedger,
}: {
  ledgerId: number;
  startTransition: TransitionStarter;
  setError: (value: string) => void;
  setBatches: (value: Batch[]) => void;
  confirmAsk: (options: {
    title: string;
    message: string;
    tone?: "danger" | "normal";
    confirmText?: string;
  }) => Promise<string | null>;
  notify: (message: string, kind?: "warning" | "success") => void;
  refreshLedger: () => Promise<void>;
}) {
  const loadImportBatches = useCallback(async () => {
    try {
      const { response, data } = await fetchClientJson<{ batches?: Batch[] }>(
        billImportBatchUrl(ledgerId),
        { cache: "no-store" },
      );
      if (!response.ok) return;
      setBatches(data?.batches ?? []);
    } catch {
      setBatches([]);
    }
  }, [ledgerId, setBatches]);

  const submitBillRows = useCallback(
    async (rows: Item[]) => {
      try {
        const { response, data } = await fetchClientJson<BillImportWriteResult>(
          "/api/bill-import",
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ledgerId, items: rows }),
          },
        );
        if (!response.ok) {
          setError(data?.error ?? "导入失败");
          return null;
        }
        void loadImportBatches();
        return data;
      } catch (error) {
        setError(errorMessage(error, "导入失败，请稍后重试"));
        return null;
      }
    },
    [ledgerId, loadImportBatches, setError],
  );

  const undoImportBatch = useCallback(
    async (batch: Batch) => {
      const agreed = await confirmAsk({
        title: batch.status === "undoing" ? "恢复批次撤销" : "撤销整批导入",
        message: batch.status === "undoing" ? `该批次可能在撤销过程中中断，将继续处理仍存在的 ${batch.importedCount} 笔流水；已处理记录不会重复冲销。` : `将删除该批次导入的 ${batch.importedCount} 笔未修改流水，并恢复相关账户余额。`,
        tone: "danger",
        confirmText: "撤销整批",
      });
      if (!agreed) return;
      startTransition(async () => {
        try {
          const { response, data } = await fetchClientJson<{ undone?: number; error?: string }>(
            billImportBatchUrl(ledgerId, batch.id, batch.status === "undoing"),
            { method: "DELETE" },
          );
          if (!response.ok) {
            setError(data?.error ?? "撤销导入失败");
            return;
          }
          notify(`已撤销 ${data?.undone ?? 0} 笔导入流水，并恢复账户余额。`, "success");
          await Promise.all([refreshLedger(), loadImportBatches()]);
        } catch (error) {
          setError(errorMessage(error, "撤销导入失败，请稍后重试"));
        }
      });
    },
    [confirmAsk, ledgerId, loadImportBatches, notify, refreshLedger, setError, startTransition],
  );

  return { submitBillRows, loadImportBatches, undoImportBatch };
}
