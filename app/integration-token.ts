import { getDbBinding } from "../db";
import {
  createIntegrationToken,
  hashIntegrationToken,
} from "./integration-token-core.js";

export { createIntegrationToken, hashIntegrationToken };

export async function ensureIntegrationTokenTable() {
  await getDbBinding()
    .prepare(
      `CREATE TABLE IF NOT EXISTS integration_tokens(
        owner_id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        token_prefix TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_used_at TEXT
      )`,
    )
    .run();
}

export async function ownerForIntegrationToken(token: string) {
  if (!token.startsWith("nls_") || token.length < 30) return null;
  await ensureIntegrationTokenTable();
  const hash = await hashIntegrationToken(token);
  const row = await getDbBinding()
    .prepare(
      "SELECT owner_id ownerId FROM integration_tokens WHERE token_hash=?",
    )
    .bind(hash)
    .first<{ ownerId: string }>();
  if (!row) return null;
  await getDbBinding()
    .prepare(
      "UPDATE integration_tokens SET last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE owner_id=?",
    )
    .bind(row.ownerId)
    .run();
  return row.ownerId;
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
