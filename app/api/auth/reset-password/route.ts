import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { ApiAccessError, accessErrorResponse } from "../../../api-security";
import {
  enforceAuthRateLimit,
  passwordRecord,
  requireSameOrigin,
} from "../../../auth";
import { validateEmail, validatePasswordStrength } from "../../../auth-core.js";
import { consumeEmailCode } from "../../../email-code";
import { MAX_AUTH_BODY_BYTES, readJsonWithLimit } from "../../../request-limits";
import { recordAuditEvent, requestIdFromRequest } from "../../../audit-log";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await enforceAuthRateLimit(request, "reset-password");
    await ensureDb();
    const body = await readJsonWithLimit<{
      email?: string;
      code?: string;
      newPassword?: string;
    }>(request, MAX_AUTH_BODY_BYTES);
    const email = validateEmail(body.email);
    if (!email) throw new ApiAccessError("请输入邮箱地址", 400);
    const newPassword = String(body.newPassword ?? "");
    if (newPassword.length < 8 || newPassword.length > 72)
      throw new ApiAccessError("新密码需为 8—72 位", 400);
    validatePasswordStrength(newPassword);

    // 先校验验证码：失败会累加尝试次数，成功即作废，杜绝一码多用。
    await consumeEmailCode({ email, purpose: "reset", code: String(body.code ?? "") });

    const db = getDbBinding();
    const owner = await db
      .prepare("SELECT id FROM app_users WHERE email=? AND disabled=0")
      .bind(email)
      .first<{ id: string }>();
    if (!owner) throw new ApiAccessError("这个邮箱没有对应的账号", 404);

    const password = await passwordRecord(newPassword);
    await db.batch([
      db
        .prepare(
          `UPDATE app_users SET password_hash=?,password_salt=?,password_iterations=?,
                  password_enabled=1,email_verified=1,
                  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
        )
        .bind(password.hash, password.salt, password.iterations, owner.id),
      // 重置密码后让所有旧会话失效，防止别人还留在已登录状态。
      db.prepare("DELETE FROM app_sessions WHERE user_id=?").bind(owner.id),
      db.prepare("DELETE FROM app_session_devices WHERE user_id=?").bind(owner.id),
    ]);
    await recordAuditEvent({
      ownerId: "user:" + owner.id,
      eventType: "auth.password_reset",
      subjectType: "user",
      subjectId: owner.id,
      requestId: requestIdFromRequest(request),
    });
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "重置密码失败", request);
  }
}
