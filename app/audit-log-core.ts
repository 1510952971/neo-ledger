type AuditValue = string | number | boolean | null;

export const MAX_AUDIT_METADATA_BYTES = 4 * 1024;
const MAX_AUDIT_METADATA_FIELDS = 32;
const MAX_AUDIT_METADATA_KEY_LENGTH = 64;
const MAX_AUDIT_METADATA_STRING_LENGTH = 512;

export type AuditCursor = { createdAt: string; id: string };

function base64UrlEncode(value: string) {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return atob(padded);
}

export function encodeAuditCursor(cursor: AuditCursor) {
  return base64UrlEncode(JSON.stringify({ createdAt: cursor.createdAt, id: cursor.id }));
}

export function decodeAuditCursor(value: unknown): AuditCursor | null {
  if (typeof value !== "string" || value.length < 8 || value.length > 256) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(value)) as Partial<AuditCursor>;
    if (
      typeof parsed.createdAt !== "string" ||
      parsed.createdAt.length < 1 ||
      parsed.createdAt.length > 64 ||
      /[\u0000-\u001f\u007f]/u.test(parsed.createdAt) ||
      typeof parsed.id !== "string" ||
      !/^[A-Za-z0-9._:-]{8,128}$/u.test(parsed.id)
    ) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export function normalizeAuditMetadata(metadata?: Record<string, AuditValue>) {
  const normalized: Record<string, AuditValue> = {};
  for (const [rawKey, rawValue] of Object.entries(metadata ?? {}).slice(0, MAX_AUDIT_METADATA_FIELDS)) {
    const key = rawKey.trim().slice(0, MAX_AUDIT_METADATA_KEY_LENGTH);
    if (!key) continue;
    if (typeof rawValue === "string") normalized[key] = rawValue.slice(0, MAX_AUDIT_METADATA_STRING_LENGTH);
    else if (typeof rawValue === "number" && Number.isFinite(rawValue)) normalized[key] = rawValue;
    else if (typeof rawValue === "boolean" || rawValue === null) normalized[key] = rawValue;
  }
  const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (byteLength(normalized) <= MAX_AUDIT_METADATA_BYTES) return normalized;
  const bounded: Record<string, AuditValue> = {};
  for (const [key, value] of Object.entries(normalized)) {
    bounded[key] = typeof value === "string" ? value.slice(0, 64) : value;
    if (byteLength(bounded) > MAX_AUDIT_METADATA_BYTES) {
      delete bounded[key];
      break;
    }
  }
  return {
    ...bounded,
    truncated: true,
    fields: Object.keys(normalized).length,
  } as Record<string, AuditValue>;
}
