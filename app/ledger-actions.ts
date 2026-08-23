import { fetchClientJson } from "./client-api.ts";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<{ response: Response; data: T | null }>;

export type LedgerActionResult = { ok: boolean; id?: number; error?: string };

export function ledgerDeleteUrl(id: number, expectedUpdatedAt: string) {
  const params = new URLSearchParams({
    id: String(id),
    expectedUpdatedAt,
  });
  return `/api/ledgers?${params.toString()}`;
}

export async function createLedger(
  input: { name: string; icon: string },
  request: RequestJson = fetchClientJson,
): Promise<LedgerActionResult> {
  const { response, data } = await request<{ id?: number; error?: string }>("/api/ledgers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return response.ok && data?.id
    ? { ok: true, id: data.id }
    : { ok: false, error: data?.error || "新建账本失败，请稍后重试。" };
}

export async function deleteLedger(
  id: number,
  expectedUpdatedAt: string,
  request: RequestJson = fetchClientJson,
): Promise<LedgerActionResult> {
  const { response, data } = await request<{ error?: string }>(
    ledgerDeleteUrl(id, expectedUpdatedAt),
    { method: "DELETE" },
  );
  return response.ok
    ? { ok: true }
    : { ok: false, error: data?.error || "删除账本失败，请稍后重试。" };
}
