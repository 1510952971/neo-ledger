export const MAX_OFFLINE_QUEUE_ENTRIES = 50;
export const MAX_OFFLINE_ENTRY_BYTES = 16 * 1024;

function encodedBytes(value: unknown) {
  const text = JSON.stringify(value);
  return new TextEncoder().encode(text).byteLength;
}

export function offlineEntryByteLength(value: unknown) {
  try {
    return encodedBytes(value);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function isOfflineEntryWithinBudget(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const offlineId = (value as { offlineId?: unknown }).offlineId;
  return typeof offlineId === "string" && /^[A-Za-z0-9_-]{1,80}$/u.test(offlineId) && offlineEntryByteLength(value) <= MAX_OFFLINE_ENTRY_BYTES;
}

export function assertOfflineEntryWithinBudget(value: unknown) {
  if (!isOfflineEntryWithinBudget(value))
    throw new Error(`离线流水必须包含有效编号且不能超过 ${Math.floor(MAX_OFFLINE_ENTRY_BYTES / 1024)}KB`);
}

export function offlineQueueHasCapacity(currentCount: number, replacingExisting: boolean) {
  if (replacingExisting) return true;
  return Number.isSafeInteger(currentCount) && currentCount >= 0 && currentCount < MAX_OFFLINE_QUEUE_ENTRIES;
}
