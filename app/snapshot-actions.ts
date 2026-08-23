import { fetchClientJson, MAX_SYNC_SNAPSHOT_RESPONSE_BYTES } from "./client-api.ts";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxBytes?: number,
) => Promise<{ response: Response; data: T | null }>;

export function exportLedgerSnapshot(request: RequestJson = fetchClientJson) {
  return request<Record<string, unknown>>(
    "/api/data/export?format=json",
    { cache: "no-store" },
    MAX_SYNC_SNAPSHOT_RESPONSE_BYTES,
  );
}
