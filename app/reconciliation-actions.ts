import { DEFAULT_CLIENT_RESPONSE_BYTES, fetchClientJson } from "./client-api.ts";

export type ReconciliationStatus = "unreconciled" | "reconciled" | "exception";
export type ReconciliationRow = {
  transactionId: number;
  status: ReconciliationStatus;
  note: string | null;
  reconciledAt: string | null;
};

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxBytes?: number,
) => Promise<{ response: Response; data: T | null }>;

function safeTransactionIds(transactionIds: number[]) {
  return transactionIds
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .slice(0, 100);
}

export function reconciliationUrl(ledgerId: number, transactionIds: number[] = []) {
  const params = new URLSearchParams({ ledger: String(ledgerId) });
  const ids = safeTransactionIds(transactionIds);
  if (ids.length) params.set("ids", ids.join(","));
  return `/api/transactions/reconciliation?${params.toString()}`;
}

export function loadReconciliationRows(input: {
  ledgerId: number;
  transactionIds?: number[];
  signal?: AbortSignal;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<ReconciliationRow[]>(
    reconciliationUrl(input.ledgerId, input.transactionIds),
    { cache: "no-store", signal: input.signal },
    DEFAULT_CLIENT_RESPONSE_BYTES,
  );
}

export function updateReconciliation(input: {
  ledgerId: number;
  transactionIds: number[];
  status: ReconciliationStatus;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ error?: string }>(
    "/api/transactions/reconciliation",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ledgerId: input.ledgerId,
        transactionIds: safeTransactionIds(input.transactionIds),
        status: input.status,
      }),
    },
    DEFAULT_CLIENT_RESPONSE_BYTES,
  );
}
