import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { ApiAccessError, accessErrorResponse } from "../../../api-security";
import {
  enforceAuthRateLimit,
  requireSameOrigin,
  sessionUserFromRequest,
} from "../../../auth";
import { validateEmail } from "../../../auth-core.js";
import { normalizeCodePurpose } from "../../../email-code-core.js";
import { issueEmailCode, type CodePurpose } from "../../../email-code";
import { mailerStatus } from "../../../mailer";
import { MAX_AUTH_BODY_BYTES, readJsonWithLimit } from "../../../request-limits";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET() {
  const status = mailerStatus();
  return privateJson({
    configured: status.configured,
  });
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await enforceAuthRateLimit(request, "email-code");
    await ensureDb();
    const body = await readJsonWithLimit<{
      email?: string;
      purpose?: string;
    }>(request, MAX_AUTH_BODY_BYTES);
    const purpose = normalizeCodePurpose(body.purpose) as CodePurpose | null;
    if (!purpose) throw new ApiAccessError("验证码用途无效", 400);
    const email = validateEmail(body.email);
    if (!email) throw new ApiAccessError("请输入邮箱地址", 400);
    if (!mailerStatus().configured)
      throw new ApiAccessError("邮件服务未配置，暂时无法发送验证码", 503);
    const db = getDbBinding();

    if (purpose === "bind") {
      const session = await sessionUserFromRequest(request);
      if (!session) throw new ApiAccessError("请先登录后再绑定邮箱", 401);
      const taken = await db
        .prepare("SELECT id FROM app_users WHERE email=? AND id<>?")
        .bind(email, session.id)
        .first();
      if (taken)
        throw new ApiAccessError("这个邮箱已经绑定到其他账号", 409);
      const result = await issueEmailCode({ email, purpose, userId: session.id });
      return privateJson({ ok: true, ...result });
    }

    if (purpose === "register") {
      const taken = await db
        .prepare("SELECT id FROM app_users WHERE email=?")
        .bind(email)
        .first();
      if (taken)
        throw new ApiAccessError("这个邮箱已经注册过了，请直接登录", 409);
      const result = await issueEmailCode({ email, purpose });
      return privateJson({ ok: true, ...result });
    }

    // reset：邮箱不存在时也返回成功，避免接口被用来枚举哪些邮箱注册过。
    const owner = await db
      .prepare("SELECT id FROM app_users WHERE email=? AND disabled=0")
      .bind(email)
      .first<{ id: string }>();
    if (!owner)
      return privateJson({
        ok: true,
        configured: mailerStatus().configured,
      });
    const result = await issueEmailCode({ email, purpose, userId: owner.id });
    return privateJson({ ok: true, ...result });
  } catch (error) {
    return accessErrorResponse(error, "验证码发送失败", request);
  }
}
