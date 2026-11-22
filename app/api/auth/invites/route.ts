import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { accessErrorResponse, ApiAccessError } from "../../../api-security";
import {
  enforceAuthRateLimit,
  requireSameOrigin,
  sessionUserFromRequest,
} from "../../../auth";
import { recordAuditEvent } from "../../../audit-log";
import { validateEmail } from "../../../auth-core.js";
import { registrationInviteHash } from "../../../registration-invite";
import { MAX_AUTH_BODY_BYTES, readJsonWithLimit } from "../../../request-limits";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

function newInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await enforceAuthRateLimit(request, "invite");
    await ensureDb();
    const user = await sessionUserFromRequest(request);
    if (!user) throw new ApiAccessError("请先登录后再生成邀请码", 401);
    const body = await readJsonWithLimit<{ email?: string }>(request, MAX_AUTH_BODY_BYTES);
    const targetEmail = validateEmail(body.email);
    if (!targetEmail) throw new ApiAccessError("请输入受邀人的邮箱", 400);

    const db = getDbBinding();
    const issued = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM registration_invites WHERE created_by=? AND created_at>=datetime('now','-1 day')",
      )
      .bind(user.id)
      .first<{ count: number }>();
    if (Number(issued?.count ?? 0) >= 5)
      throw new ApiAccessError("每个账号每天最多生成 5 个邀请码", 429);

    const code = newInviteCode();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db
      .prepare("INSERT INTO registration_invites(code_hash,created_by,target_email,expires_at) VALUES(?,?,?,?)")
      .bind(registrationInviteHash(code), user.id, targetEmail, expiresAt)
      .run();
    await recordAuditEvent({
      ownerId: user.id,
      eventType: "auth.invite.create",
      subjectType: "registration_invite",
      metadata: { expiresAt },
    });
    return privateJson({ ok: true, code, expiresAt });
  } catch (error) {
    return accessErrorResponse(error, "生成邀请码失败", request);
  }
}
