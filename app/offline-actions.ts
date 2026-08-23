import { fetchClientJson, MAX_OFFLINE_SYNC_RESPONSE_BYTES } from "./client-api.ts";
import { isOfflineEntryWithinBudget, MAX_OFFLINE_QUEUE_ENTRIES } from "./offline-queue.ts";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxBytes?: number,
) => Promise<{ response: Response; data: T | null }>;

export async function syncOfflineEntries<T extends { offlineId?: unknown }>(input: {
  online: boolean;
  list: () => Promise<T[]>;
  remove: (ids: string[]) => Promise<void>;
  request?: RequestJson;
}): Promise<number> {
  const items = (await input.list())
    .filter((item) => isOfflineEntryWithinBudget(item))
    .slice(0, MAX_OFFLINE_QUEUE_ENTRIES);
  if (!input.online || !items.length) return items.length;
  const request = input.request ?? fetchClientJson;
  const { response, data } = await request<{ synced?: string[] }>(
    "/api/offline-sync",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    },
    MAX_OFFLINE_SYNC_RESPONSE_BYTES,
  );
  if (!response.ok) return items.length;
  const submittedIds = new Set(
    items
      .map((item) => item.offlineId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const synced = Array.isArray(data?.synced)
    ? [...new Set(data.synced)].filter(
        (id): id is string => typeof id === "string" && submittedIds.has(id),
      )
    : [];
  await input.remove(synced);
  return (await input.list()).length;
}
