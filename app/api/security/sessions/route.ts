import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import {
  ApiAccessError,
  accessErrorResponse,
  requestOwnerId,
} from "../../../api-security";
import {
  authTokenDigest,
  requireSameOrigin,
  sessionUserFromRequest,
} from "../../../auth";
import { parseCookieValue, SESSION_COOKIE_NAME } from "../../../auth-core.js";
import { recordAuditEvent, requestIdFromRequest } from "../../../audit-log";
import { readSessionRevokeInput } from "../../../internal-api-contract";

const SESSION_LIST_LIMIT = 100;

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

async function currentTokenHash(request: Request) {
  const token = parseCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  return token ? authTokenDigest(token) : null;
}

export async function GET(request: Request) {
  try {
    const user = await sessionUserFromRequest(request);
    if (!user) throw new ApiAccessError("请先登录后管理设备", 401);
    await ensureDb();
    const db = getDbBinding();
    // 设备列表是用户可见的安全证明：过期或已撤销的记录不能继续伪装成活跃设备。
    // 清理采用集合操作，避免设备数量异常时先把全部 token hash 读入应用内存。
    await db.batch([
      db
        .prepare("DELETE FROM app_sessions WHERE user_id=? AND token_hash IN (SELECT token_hash FROM app_session_devices WHERE user_id=? AND (expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') OR revoked_at IS NOT NULL))")
        .bind(user.id, user.id),
      db
        .prepare("DELETE FROM app_session_devices WHERE user_id=? AND (expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') OR revoked_at IS NOT NULL)")
        .bind(user.id),
    ]);
    const hash = await currentTokenHash(request);
    const total = await db
      .prepare(
        "SELECT COUNT(*) count FROM app_session_devices WHERE user_id=? AND revoked_at IS NULL AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')",
      )
      .bind(user.id)
      .first<{ count: number }>();
    const rows = await db
      .prepare(
        `SELECT id,token_hash tokenHash,display_name displayName,user_agent userAgent,ip_address ipAddress,
               created_at createdAt,last_used_at lastUsedAt,expires_at expiresAt,
               revoked_at revokedAt
         FROM app_session_devices
         WHERE user_id=? AND revoked_at IS NULL AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
         ORDER BY last_used_at DESC
         LIMIT ?`,
      )
      .bind(user.id, SESSION_LIST_LIMIT)
      .all();
    const totalCount = Number(total?.count ?? 0);
    const response = privateJson({
      sessions: rows.results.map((row) => ({
        ...row,
        current: Boolean(hash && row.tokenHash === hash),
        tokenHash: undefined,
      })),
    });
    response.headers.set("X-Total-Count", String(totalCount));
    response.headers.set("X-Has-More", totalCount > rows.results.length ? "1" : "0");
    return response;
  } catch (error) {
    return accessErrorResponse(error, "读取设备会话失败", request);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await sessionUserFromRequest(request);
    if (!user) throw new ApiAccessError("请先登录后注销设备", 401);
    const body = await readSessionRevokeInput(request);
    await ensureDb();
    const db = getDbBinding();
    const currentHash = await currentTokenHash(request);
    if (body.allExceptCurrent) {
      if (!currentHash) throw new ApiAccessError("当前设备会话无效", 401);
      const count = await db
        .prepare("SELECT COUNT(*) count FROM app_session_devices WHERE user_id=? AND revoked_at IS NULL AND token_hash<>?")
        .bind(user.id, currentHash)
        .first<{ count: number }>();
      const revokedCount = Number(count?.count ?? 0);
      if (!revokedCount) throw new ApiAccessError("没有找到可注销的设备", 404);
      await db.batch([
        db.prepare("DELETE FROM app_sessions WHERE user_id=? AND token_hash<>?").bind(user.id, currentHash),
        db.prepare("UPDATE app_session_devices SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND revoked_at IS NULL AND token_hash<>?").bind(user.id, currentHash),
      ]);
      const ownerId = await requestOwnerId(request);
      await recordAuditEvent({
        ownerId,
        eventType: "session.revoke_all_other",
        subjectType: "session",
        subjectId: "others",
        requestId: requestIdFromRequest(request),
        metadata: { count: revokedCount },
      });
      return privateJson({ ok: true, revoked: revokedCount });
    }
    if (!body.sessionId) throw new ApiAccessError("没有找到可注销的设备", 404);
    const target = await db
      .prepare("SELECT id,token_hash tokenHash FROM app_session_devices WHERE id=? AND user_id=? AND revoked_at IS NULL")
      .bind(body.sessionId, user.id)
      .first<{ id: string; tokenHash: string }>();
    if (!target) throw new ApiAccessError("没有找到可注销的设备", 404);
    await db.batch([
      db.prepare("DELETE FROM app_sessions WHERE token_hash=? AND user_id=?").bind(target.tokenHash, user.id),
      db
        .prepare("UPDATE app_session_devices SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND user_id=?")
        .bind(target.id, user.id),
    ]);
    const ownerId = await requestOwnerId(request);
    await recordAuditEvent({
      ownerId,
      eventType: "session.revoke",
      subjectType: "session",
      subjectId: target.id,
      requestId: requestIdFromRequest(request),
      metadata: { count: 1 },
    });
    return privateJson({ ok: true, revoked: 1 });
  } catch (error) {
    return accessErrorResponse(error, "注销设备失败", request);
  }
}
