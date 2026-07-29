export const CLOUD_SYNC_INTERVALS = [1, 5, 15, 30];

export function normalizeCloudSyncInterval(value) {
  const interval = Number(value);
  return CLOUD_SYNC_INTERVALS.includes(interval) ? interval : 5;
}

export function shouldRunCloudSync(input) {
  if (
    !input?.enabled ||
    !input?.online ||
    !String(input?.url || "") ||
    !String(input?.password || "") ||
    String(input?.secret || "").length < 8
  )
    return false;
  const intervalMs = normalizeCloudSyncInterval(input.intervalMinutes) * 60_000;
  return Number(input.now) - Number(input.lastSyncAt || 0) >= intervalMs;
}
