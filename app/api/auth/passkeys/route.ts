import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { ApiAccessError, accessErrorResponse } from "../../../api-security";
import { createSession, enforceAuthRateLimit, requireSameOrigin, sessionUserFromRequest } from "../../../auth";
import { recordAuditEvent, requestIdFromRequest } from "../../../audit-log";
import { consumePasskeyChallenge, storePasskeyChallenge } from "../../../passkey-challenge";
import { authenticatePasskey, authenticationOptions, listPasskeys, PASSKEY_LIMIT, registerPasskey, registrationOptions } from "../../../passkey";
import { MAX_PASSKEY_BODY_BYTES, readJsonWithLimit } from "../../../request-limits";

async function requireUser(request: Request) {
  const user = await sessionUserFromRequest(request);
  if (!user) throw new ApiAccessError("请先登录后管理 Passkey", 401);
  return user;
}

function boundedString(value: unknown, max: number) {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

function validateCredentialResponse(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiAccessError("Passkey 响应格式无效", 400);
  const response = value as Record<string, unknown>;
  if (!boundedString(response.id, 512) || !boundedString(response.rawId, 1024) || response.type !== "public-key")
    throw new ApiAccessError("Passkey 凭据标识无效", 400);
  if (!response.response || typeof response.response !== "object" || Array.isArray(response.response))
    throw new ApiAccessError("Passkey 凭据数据缺失", 400);
  return value;
}

function challengeId(value: unknown) {
  const id = boundedString(value, 64);
  if (!id || !/^[0-9a-f-]{36}$/iu.test(id))
    throw new ApiAccessError("Passkey 挑战标识无效", 400);
  return id;
}

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await ensureDb();
    const db = getDbBinding();
    const total = await db.prepare("SELECT COUNT(*) count FROM user_passkeys WHERE user_id=?").bind(user.id).first<{ count: number }>();
    const response = privateJson(await listPasskeys(user.id));
    const totalCount = Number(total?.count ?? 0);
    response.headers.set("X-Total-Count", String(totalCount));
    response.headers.set("X-Has-More", totalCount > PASSKEY_LIMIT ? "1" : "0");
    return response;
  } catch (error) {
    return accessErrorResponse(error, "读取 Passkey 失败", request);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await enforceAuthRateLimit(request, "passkey");
    const parsed = await readJsonWithLimit<unknown>(request, MAX_PASSKEY_BODY_BYTES);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new ApiAccessError("Passkey 请求体必须是 JSON 对象", 400);
    const body = parsed as {
      action?: string;
      challengeId?: string;
      label?: string;
      response?: RegistrationResponseJSON | AuthenticationResponseJSON;
    };
    if (body.action === "begin-authentication") {
      const options = await authenticationOptions(request);
      const challengeId = await storePasskeyChallenge({ purpose: "authentication", challenge: options.challenge });
      return privateJson({ challengeId, options });
    }
    if (body.action === "finish-authentication") {
      const challenge = await consumePasskeyChallenge({ id: challengeId(body.challengeId), purpose: "authentication" });
      if (!challenge) throw new ApiAccessError("Passkey 登录挑战无效或已过期", 400);
      const authenticated = await authenticatePasskey({ challenge, response: validateCredentialResponse(body.response) as AuthenticationResponseJSON, request });
      const session = await createSession(authenticated.userId, request);
      await recordAuditEvent({
        ownerId: `user:${authenticated.userId}`,
        eventType: "passkey.login",
        subjectType: "passkey",
        subjectId: authenticated.credentialId,
        requestId: requestIdFromRequest(request),
      });
      return privateJson({ ok: true }, { headers: { "Set-Cookie": session.cookie } });
    }
    const user = await requireUser(request);
    if (body.action === "begin-registration") {
      const options = await registrationOptions(user, request);
      const challengeId = await storePasskeyChallenge({ userId: user.id, purpose: "registration", challenge: options.challenge });
      return privateJson({ challengeId, options });
    }
    if (body.action !== "finish-registration")
      throw new ApiAccessError("Passkey 操作无效", 400);
    const challenge = await consumePasskeyChallenge({ id: challengeId(body.challengeId), userId: user.id, purpose: "registration" });
    if (!challenge) throw new ApiAccessError("Passkey 注册挑战无效或已过期", 400);
    const label = body.label === undefined ? "当前设备" : boundedString(body.label, 60);
    if (!label) throw new ApiAccessError("Passkey 名称无效", 400);
    const credentialId = await registerPasskey({
      userId: user.id,
      label,
      challenge,
      response: validateCredentialResponse(body.response) as RegistrationResponseJSON,
      request,
    });
    await recordAuditEvent({
      ownerId: user.ownerId,
      eventType: "passkey.register",
      subjectType: "passkey",
      subjectId: credentialId,
      requestId: requestIdFromRequest(request),
    });
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "Passkey 操作失败", request);
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    await enforceAuthRateLimit(request, "passkey");
    const user = await requireUser(request);
    const parsed = await readJsonWithLimit<unknown>(request, MAX_PASSKEY_BODY_BYTES);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new ApiAccessError("Passkey 请求体必须是 JSON 对象", 400);
    const body = parsed as { id?: string };
    await ensureDb();
    const deleted = await getDbBinding()
      .prepare("DELETE FROM user_passkeys WHERE id=? AND user_id=?")
      .bind(String(body.id ?? ""), user.id)
      .run();
    if (!deleted.meta.changes) throw new ApiAccessError("Passkey 不存在", 404);
    await recordAuditEvent({
      ownerId: user.ownerId,
      eventType: "passkey.revoke",
      subjectType: "passkey",
      subjectId: body.id,
      requestId: requestIdFromRequest(request),
    });
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "撤销 Passkey 失败", request);
  }
}
