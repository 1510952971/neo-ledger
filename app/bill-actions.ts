import { fetchClientJson } from "./client-api.ts";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<{ response: Response; data: T | null }>;

export async function loadBillForEdit<T>(
  ledgerId: number,
  transactionId: number,
  request: RequestJson = fetchClientJson,
): Promise<{ item: T | null; error?: string }> {
  const { response, data } = await request<{ items?: T[]; error?: string }>(
    `/api/transactions/query?ledger=${encodeURIComponent(ledgerId)}&id=${encodeURIComponent(transactionId)}&limit=1`,
    { cache: "no-store" },
  );
  return {
    item: response.ok && Array.isArray(data?.items) ? data.items[0] ?? null : null,
    error: response.ok ? undefined : data?.error || "读取账单失败，请刷新后重试。",
  };
}
