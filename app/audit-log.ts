import { ensureDb, getDbBinding } from "../db";
import {
  decodeAuditCursor,
  encodeAuditCursor,
  normalizeAuditMetadata,
  type AuditCursor,
} from "./audit-log-core";

type AuditValue = string | number | boolean | null;

export { normalizeAuditMetadata, MAX_AUDIT_METADATA_BYTES } from "./audit-log-core";

export function validRequestId(value: string | null | undefined) {
  const supplied = value?.trim();
  return supplied && /^[A-Za-z0-9._:-]{8,128}$/.test(supplied)
    ? supplied
    : null;
}

export function requestIdFromRequest(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim();
  return validRequestId(supplied) ?? crypto.randomUUID();
}

/**
 * Audit records are append-only at the database layer and deliberately contain only structured metadata. Never pass
 * passwords, session tokens, backup payloads or raw bill contents here.
 * Logging is best effort so an observability outage cannot corrupt a ledger.
 */
export async function recordAuditEvent(input: {
  ownerId: string;
  eventType: string;
  subjectType?: string | null;
  subjectId?: string | number | null;
  requestId?: string | null;
  metadata?: Record<string, AuditValue>;
}) {
  try {
    await ensureDb();
    await getDbBinding()
      .prepare(
        `INSERT INTO audit_events(id,owner_id,event_type,subject_type,subject_id,request_id,metadata_json)
         VALUES(?,?,?,?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.ownerId,
        input.eventType.slice(0, 80),
        input.subjectType?.slice(0, 80) ?? null,
        input.subjectId == null ? null : String(input.subjectId).slice(0, 120),
        input.requestId?.slice(0, 128) ?? null,
        JSON.stringify(normalizeAuditMetadata(input.metadata)),
      )
      .run();
  } catch {
    // Audit must not turn a successful data operation into a 500 response.
  }
}

export async function listAuditEvents(ownerId: string, limit = 100, before?: AuditCursor) {
  await ensureDb();
  const bounded = Math.max(1, Math.min(200, Math.floor(limit)));
  const query = before
    ? `SELECT id,event_type eventType,subject_type subjectType,subject_id subjectId,
              request_id requestId,metadata_json metadataJson,created_at createdAt
       FROM audit_events
       WHERE owner_id=? AND (created_at < ? OR (created_at = ? AND id < ?))
       ORDER BY created_at DESC,id DESC LIMIT ?`
    : `SELECT id,event_type eventType,subject_type subjectType,subject_id subjectId,
              request_id requestId,metadata_json metadataJson,created_at createdAt
       FROM audit_events WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT ?`;
  const rows = await getDbBinding()
    .prepare(query)
    .bind(...(before ? [ownerId, before.createdAt, before.createdAt, before.id, bounded + 1] : [ownerId, bounded + 1]))
    .all<{
      id: string;
      eventType: string;
      subjectType: string | null;
      subjectId: string | null;
      requestId: string | null;
      metadataJson: string;
      createdAt: string;
    }>();
  const hasMore = rows.results.length > bounded;
  const page = rows.results.slice(0, bounded);
  return {
    events: page.map((row) => ({
    ...row,
    metadata: (() => {
      try {
        const value = JSON.parse(row.metadataJson);
        return value && typeof value === "object" ? value : {};
      } catch {
        return {};
      }
    })(),
    })),
    hasMore,
    nextCursor: hasMore && page.length
      ? encodeAuditCursor({ createdAt: page.at(-1)?.createdAt ?? "", id: page.at(-1)?.id ?? "" })
      : null,
  };
}

export { decodeAuditCursor };
