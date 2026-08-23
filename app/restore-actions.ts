import { fetchClientJson, MAX_RESTORE_UPLOAD_BYTES } from "./client-api.ts";

export const restoreSnapshotUrl = "/api/data/restore";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxBytes?: number,
) => Promise<{ response: Response; data: T | null }>;

export type RestoreActionResult = {
  summary?: unknown;
  error?: string;
};

function restoreHeaders(input: { dryRun?: boolean; planChecksum?: string }) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (input.dryRun) headers.set("X-Restore-Dry-Run", "1");
  if (input.planChecksum)
    headers.set("X-Restore-Plan-Checksum", input.planChecksum);
  return headers;
}

export function loadRestoreSnapshots(input: {
  signal?: AbortSignal;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  const init: RequestInit = { cache: "no-store" };
  if (input.signal) init.signal = input.signal;
  return request<unknown>(restoreSnapshotUrl, init, MAX_RESTORE_UPLOAD_BYTES);
}

export function restoreBackupPayload(input: {
  payload: string;
  dryRun?: boolean;
  planChecksum?: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<RestoreActionResult>(
    restoreSnapshotUrl,
    {
      method: "POST",
      headers: restoreHeaders(input),
      body: input.payload,
    },
    MAX_RESTORE_UPLOAD_BYTES,
  );
}

export function restoreSavedSnapshot(input: {
  snapshotId: string;
  dryRun?: boolean;
  planChecksum?: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<RestoreActionResult>(
    restoreSnapshotUrl,
    {
      method: "POST",
      headers: restoreHeaders(input),
      body: JSON.stringify({ restoreSnapshotId: input.snapshotId }),
    },
    MAX_RESTORE_UPLOAD_BYTES,
  );
}

export function restoreSnapshotData(input: {
  snapshot: Record<string, unknown>;
  dryRun?: boolean;
  planChecksum?: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<RestoreActionResult>(
    restoreSnapshotUrl,
    {
      method: "POST",
      headers: restoreHeaders(input),
      body: JSON.stringify(input.snapshot),
    },
    MAX_RESTORE_UPLOAD_BYTES,
  );
}
