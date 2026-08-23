import { getDbBinding } from "../db";
import { recordAuditEvent } from "./audit-log";
import {
  createIntegrationToken,
  hashIntegrationToken,
} from "./integration-token-core.js";

export { createIntegrationToken, hashIntegrationToken };

export async function ensureIntegrationTokenTable() {
  const db = getDbBinding();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS integration_tokens(
        owner_id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        token_prefix TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at TEXT,
        label TEXT NOT NULL DEFAULT '自动记账连接',
        scope TEXT NOT NULL DEFAULT 'ledger:write',
        expires_at TEXT,
        created_ip TEXT,
        last_used_ip TEXT
      )`,
    )
    .run();
  const columns = await db.prepare("PRAGMA table_info(integration_tokens)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const additions = [
    ["label", "ALTER TABLE integration_tokens ADD COLUMN label TEXT NOT NULL DEFAULT '自动记账连接'"],
    ["scope", "ALTER TABLE integration_tokens ADD COLUMN scope TEXT NOT NULL DEFAULT 'ledger:write'"],
    ["expires_at", "ALTER TABLE integration_tokens ADD COLUMN expires_at TEXT"],
    ["created_ip", "ALTER TABLE integration_tokens ADD COLUMN created_ip TEXT"],
    ["last_used_ip", "ALTER TABLE integration_tokens ADD COLUMN last_used_ip TEXT"],
  ] as const;
  for (const [name, sql] of additions) if (!names.has(name)) await db.prepare(sql).run();
}

function sourceIpFromRequest(request?: Request) {
  if (!request) return null;
  // This is an audit/alert hint only. It never participates in authentication;
  // deployments must trust proxy headers only at their edge.
  const value = (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    ""
  ).trim();
  return value && value.length <= 80 ? value : null;
}

export async function ownerForIntegrationToken(token: string, request?: Request) {
  if (!token.startsWith("nls_") || token.length < 30) return null;
  await ensureIntegrationTokenTable();
  const hash = await hashIntegrationToken(token);
  const row = await getDbBinding()
    .prepare(
      "SELECT owner_id ownerId,scope,expires_at expiresAt,last_used_ip lastUsedIp FROM integration_tokens WHERE token_hash=? AND (expires_at IS NULL OR expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    )
    .bind(hash)
    .first<{ ownerId: string; scope: string; expiresAt: string | null; lastUsedIp: string | null }>();
  if (!row) return null;
  const sourceIp = sourceIpFromRequest(request);
  const ipChanged = Boolean(sourceIp && row.lastUsedIp && sourceIp !== row.lastUsedIp);
  await getDbBinding()
    .prepare(
      "UPDATE integration_tokens SET last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),last_used_ip=COALESCE(?,last_used_ip) WHERE owner_id=?",
    )
    .bind(sourceIp, row.ownerId)
    .run();
  if (ipChanged)
    await recordAuditEvent({
      ownerId: row.ownerId,
      eventType: "integration_token.source_changed",
      subjectType: "integration_token",
      metadata: { changed: true },
    });
  return row.scope.split(",").includes("ledger:write") ? row.ownerId : null;
}

export async function enforceIntegrationRateLimit(ownerId: string) {
  const db = getDbBinding();
  const windowStart = Math.floor(Date.now() / 60_000);
  await db
    .prepare(
      `INSERT INTO api_rate_limits(owner_id,scope,window_start,count)
       VALUES(?,'quick-sync',?,1)
       ON CONFLICT(owner_id,scope,window_start)
       DO UPDATE SET count=count+1`,
    )
    .bind(ownerId, windowStart)
    .run();
  const row = await db
    .prepare(
      "SELECT count FROM api_rate_limits WHERE owner_id=? AND scope='quick-sync' AND window_start=?",
    )
    .bind(ownerId, windowStart)
    .first<{ count: number }>();
  if (windowStart % 60 === 0)
    await db
      .prepare("DELETE FROM api_rate_limits WHERE window_start<?")
      .bind(windowStart - 1_440)
      .run();
  if ((row?.count ?? 0) > 60) throw new Error("请求过于频繁，请一分钟后再试");
}
