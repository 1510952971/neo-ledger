import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { accessErrorResponse, requestOwnerId } from "../../../api-security";
import {
  createIntegrationToken,
  ensureIntegrationTokenTable,
  hashIntegrationToken,
} from "../../../integration-token";
import { recordAuditEvent, requestIdFromRequest } from "../../../audit-log";
import { readIntegrationTokenInput } from "../../../internal-api-contract";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    await ensureIntegrationTokenTable();
    const ownerId = await requestOwnerId(request);
    const db = getDbBinding();
    const [row, stats] = await Promise.all([
      db
        .prepare(
          "SELECT token_prefix tokenPrefix,label,scope,expires_at expiresAt,created_at createdAt,last_used_at lastUsedAt FROM integration_tokens WHERE owner_id=? AND (expires_at IS NULL OR expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
        )
        .bind(ownerId)
        .first<{
          tokenPrefix: string;
          createdAt: string;
          lastUsedAt: string | null;
        }>(),
      db
        .prepare(
          "SELECT COUNT(*) processedCount,MAX(created_at) lastEventAt FROM integration_events WHERE owner_id=?",
        )
        .bind(ownerId)
        .first<{ processedCount: number; lastEventAt: string | null }>(),
    ]);
    return privateJson({
      active: Boolean(row),
      ...row,
      processedCount: Number(stats?.processedCount ?? 0),
      lastEventAt: stats?.lastEventAt ?? null,
    });
  } catch (error) {
    return accessErrorResponse(error, "读取自动记账密钥失败", request);
  }
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    await ensureIntegrationTokenTable();
    const ownerId = await requestOwnerId(request);
    const body = await readIntegrationTokenInput(request);
    const days = body.expiresInDays;
    const scope = body.scope;
    const label = body.label;
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    const token = createIntegrationToken();
    const hash = await hashIntegrationToken(token);
    await getDbBinding()
      .prepare(
        `INSERT INTO integration_tokens(owner_id,token_hash,token_prefix,label,scope,expires_at,created_ip)
         VALUES(?,?,?,?,?,?,?)
         ON CONFLICT(owner_id) DO UPDATE SET
           token_hash=excluded.token_hash,
           token_prefix=excluded.token_prefix,
           label=excluded.label,
           scope=excluded.scope,
           expires_at=excluded.expires_at,
           created_ip=excluded.created_ip,
           created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           last_used_at=NULL,
           last_used_ip=NULL`,
    )
      .bind(ownerId, hash, `${token.slice(0, 12)}…`, label, scope, expiresAt, (request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").slice(0, 80) || null)
      .run();
    await recordAuditEvent({ ownerId, eventType: "integration_token.rotate", subjectType: "integration_token", requestId: requestIdFromRequest(request), metadata: { days, scope } });
    return privateJson({
      active: true,
      token,
      tokenPrefix: `${token.slice(0, 12)}…`,
      label,
      createdAt,
      expiresAt,
      scope,
    });
  } catch (error) {
    return accessErrorResponse(error, "生成自动记账密钥失败", request);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    await ensureIntegrationTokenTable();
    const ownerId = await requestOwnerId(request);
    await getDbBinding()
      .prepare("DELETE FROM integration_tokens WHERE owner_id=?")
      .bind(ownerId)
      .run();
    await recordAuditEvent({ ownerId, eventType: "integration_token.revoke", subjectType: "integration_token", requestId: requestIdFromRequest(request) });
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "撤销自动记账密钥失败", request);
  }
}
