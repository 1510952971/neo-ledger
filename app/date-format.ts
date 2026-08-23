/**
 * Deterministic date formatting for values rendered during SSR and hydration.
 *
 * The server and a user's browser can have different locale/timezone settings.
 * Formatting with the runtime defaults therefore risks different HTML during
 * hydration. Neo Ledger stores timestamps as UTC and presents them in the
 * product's fixed China Standard Time display timezone.
 */
const DISPLAY_OFFSET_MS = 8 * 60 * 60 * 1000;

export function parseAppDate(value: string): Date {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  return new Date(withZone);
}

export function formatAppDateTime(value: string, padded = false): string {
  const date = parseAppDate(value);
  if (Number.isNaN(date.getTime())) return "记录时间";

  // Asia/Shanghai has a fixed UTC+08:00 offset, so UTC arithmetic is stable
  // across Node and browser ICU/locale implementations.
  const displayDate = new Date(date.getTime() + DISPLAY_OFFSET_MS);
  const year = displayDate.getUTCFullYear();
  const month = displayDate.getUTCMonth() + 1;
  const day = displayDate.getUTCDate();
  const hour = String(displayDate.getUTCHours()).padStart(2, "0");
  const minute = String(displayDate.getUTCMinutes()).padStart(2, "0");

  return `${year}/${padded ? String(month).padStart(2, "0") : month}/${padded ? String(day).padStart(2, "0") : day} ${hour}:${minute}`;
}
