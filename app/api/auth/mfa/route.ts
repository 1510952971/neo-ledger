import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { ApiAccessError, accessErrorResponse, requestOwnerId } from "../../../api-security";
import { enforceAuthRateLimit, requireSameOrigin, sessionUserFromRequest } from "../../../auth";
import { recordAuditEvent, requestIdFromRequest } from "../../../audit-log";
import { createTotpSecret, totpUri, verifyTotp } from "../../../totp";
import { remainingRecoveryCodes, replaceRecoveryCodes } from "../../../mfa-recovery";
import { MAX_AUTH_BODY_BYTES, readJsonWithLimit } from "../../../request-limits";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

async function requireUser(request: Request) {
  const user = await sessionUserFromRequest(request);
  if (!user) throw new ApiAccessError("请先登录后管理二次验证", 401);
  return user;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await ensureDb();
    const row = await getDbBinding()
      .prepare("SELECT enabled FROM user_mfa WHERE user_id=?")
      .bind(user.id)
      .first<{ enabled: number }>();
    return privateJson({
      enabled: Boolean(row?.enabled),
      recoveryCodesRemaining: row?.enabled ? await remainingRecoveryCodes(user.id) : 0,
    });
  } catch (error) {
    return accessErrorResponse(error, "读取二次验证状态失败", request);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await enforceAuthRateLimit(request, "mfa");
    const user = await requireUser(request);
    const body = await readJsonWithLimit<{
      action?: "begin" | "enable" | "regenerate-recovery";
      code?: string;
    }>(request, MAX_AUTH_BODY_BYTES);
    await ensureDb();
    const db = getDbBinding();
    if (body.action === "begin") {
      const existing = await db
        .prepare("SELECT enabled FROM user_mfa WHERE user_id=?")
        .bind(user.id)
        .first<{ enabled: number }>();
      if (existing?.enabled)
        throw new ApiAccessError("二次验证已启用，不能覆盖现有验证器密钥", 409);
      const secret = createTotpSecret();
      await db.batch([
        db.prepare(
          `INSERT INTO user_mfa(user_id,secret,enabled,updated_at) VALUES(?,?,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           ON CONFLICT(user_id) DO UPDATE SET secret=excluded.secret,enabled=0,updated_at=excluded.updated_at`,
        )
          .bind(user.id, secret),
        db.prepare("DELETE FROM user_mfa_recovery_codes WHERE user_id=?").bind(user.id),
      ]);
      return privateJson({ secret, uri: totpUri(secret, user.email ?? user.username) });
    }
    const row = await db
      .prepare("SELECT secret,enabled FROM user_mfa WHERE user_id=?")
      .bind(user.id)
      .first<{ secret: string; enabled: number }>();
    if (body.action === "regenerate-recovery") {
      if (!row?.enabled) throw new ApiAccessError("请先启用二次验证", 400);
      const step = await verifyTotp(row.secret, String(body.code ?? ""));
      if (step == null) throw new ApiAccessError("验证码不正确或已过期", 401);
      const claimed = await db
        .prepare(
          `UPDATE user_mfa SET last_used_step=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
           WHERE user_id=? AND enabled=1 AND (last_used_step IS NULL OR last_used_step<?)`,
        )
        .bind(step, user.id, step)
        .run();
      if (!claimed.meta.changes)
        throw new ApiAccessError("这个验证码已经使用，请等待验证器刷新", 409);
      const recoveryCodes = await replaceRecoveryCodes(user.id);
      await recordAuditEvent({
        ownerId: await requestOwnerId(request),
        eventType: "mfa.recovery_regenerate",
        subjectType: "user",
        subjectId: user.id,
        requestId: requestIdFromRequest(request),
        metadata: { count: recoveryCodes.length },
      });
      return privateJson({ recoveryCodes, recoveryCodesRemaining: recoveryCodes.length });
    }
    if (body.action !== "enable") throw new ApiAccessError("二次验证操作无效", 400);
    if (!row) throw new ApiAccessError("请先获取二次验证密钥", 400);
    if (row.enabled) throw new ApiAccessError("二次验证已经启用", 409);
    const step = await verifyTotp(row.secret, String(body.code ?? ""));
    if (step == null) throw new ApiAccessError("验证码不正确或已过期", 401);
    await db
      .prepare("UPDATE user_mfa SET enabled=1,last_used_step=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=?")
      .bind(step, user.id)
      .run();
    const recoveryCodes = await replaceRecoveryCodes(user.id);
    await recordAuditEvent({
      ownerId: await requestOwnerId(request),
      eventType: "mfa.enable",
      subjectType: "user",
      subjectId: user.id,
      requestId: requestIdFromRequest(request),
    });
    return privateJson({
      enabled: true,
      recoveryCodes,
      recoveryCodesRemaining: recoveryCodes.length,
    });
  } catch (error) {
    return accessErrorResponse(error, "启用二次验证失败", request);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    await enforceAuthRateLimit(request, "mfa");
    const user = await requireUser(request);
    const body = await readJsonWithLimit<{ code?: string }>(request, MAX_AUTH_BODY_BYTES);
    await ensureDb();
    const db = getDbBinding();
    const row = await db
      .prepare("SELECT secret,enabled FROM user_mfa WHERE user_id=?")
      .bind(user.id)
      .first<{ secret: string; enabled: number }>();
    if (!row?.enabled) return privateJson({ enabled: false });
    const step = await verifyTotp(row.secret, String(body.code ?? ""));
    if (step == null)
      throw new ApiAccessError("验证码不正确，不能关闭二次验证", 401);
    const claimed = await db
      .prepare(
        `UPDATE user_mfa SET last_used_step=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE user_id=? AND enabled=1 AND (last_used_step IS NULL OR last_used_step<?)`,
      )
      .bind(step, user.id, step)
      .run();
    if (!claimed.meta.changes)
      throw new ApiAccessError("这个验证码已经使用，请等待验证器刷新", 409);
    await db.batch([
      db.prepare("DELETE FROM user_mfa_recovery_codes WHERE user_id=?").bind(user.id),
      db.prepare("DELETE FROM user_mfa WHERE user_id=?").bind(user.id),
    ]);
    await recordAuditEvent({
      ownerId: await requestOwnerId(request),
      eventType: "mfa.disable",
      subjectType: "user",
      subjectId: user.id,
      requestId: requestIdFromRequest(request),
    });
    return privateJson({ enabled: false });
  } catch (error) {
    return accessErrorResponse(error, "关闭二次验证失败", request);
  }
}
