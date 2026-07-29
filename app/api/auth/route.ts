import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { ApiAccessError, accessErrorResponse } from "../../api-security";
import {
  adoptOrProvisionVault,
  createSession,
  enforceAuthRateLimit,
  hasLocalUsers,
  passwordRecord,
  requireSameOrigin,
  revokeRequestSession,
  sessionUserFromRequest,
  validateAvatarDataUrl,
  verifyPassword,
} from "../../auth";
import {
  normalizeEmail,
  normalizeUsername,
  validateEmail,
  validateRegistrationInput,
} from "../../auth-core.js";
import { consumeEmailCode } from "../../email-code";
import { ensureIntegrationTokenTable } from "../../integration-token";
import { oauthProviderStatus } from "../../oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureDb();
    const user = await sessionUserFromRequest(request);
    const db = getDbBinding();
    const linked: { results: Array<{ provider: "wechat" | "alipay" }> } = user
      ? await db
          .prepare("SELECT provider FROM app_identities WHERE user_id=? ORDER BY provider")
          .bind(user.id)
          .all<{ provider: "wechat" | "alipay" }>()
      : { results: [] };
    const password = user
      ? await db
          .prepare("SELECT password_enabled passwordEnabled FROM app_users WHERE id=?")
          .bind(user.id)
          .first<{ passwordEnabled: number }>()
      : null;
    return NextResponse.json({
      authenticated: Boolean(user),
      hasUsers: await hasLocalUsers(),
      providers: oauthProviderStatus(),
      linkedProviders: linked.results.map((row) => row.provider),
      passwordEnabled: Boolean(password?.passwordEnabled),
      user: user
        ? {
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            avatarUrl: user.avatarUrl,
          }
        : null,
    });
  } catch (error) {
    return accessErrorResponse(error, "读取账号状态失败");
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureDb();
    const body = (await request.json()) as {
      action?: "login" | "register";
      username?: string;
      email?: string;
      displayName?: string;
      password?: string;
    };
    const action = body.action === "register" ? "register" : "login";
    await enforceAuthRateLimit(request, action);
    const db = getDbBinding();
    let user: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
    };

    if (action === "register") {
      const value = validateRegistrationInput(body);
      // 邮箱仍可留空（本地自用场景），但只要填了就必须先通过验证码验证，
      // 否则填错邮箱的人以后既收不到重置邮件、也占用了别人的邮箱。
      if (value.email)
        await consumeEmailCode({
          email: value.email,
          purpose: "register",
          code: String((body as { code?: string }).code ?? ""),
        });
      const firstAccount = !(await hasLocalUsers());
      const password = await passwordRecord(value.password);
      const id = crypto.randomUUID();
      try {
        await db
          .prepare(
            `INSERT INTO app_users(id,username,email,display_name,password_hash,password_salt,password_iterations,email_verified)
             VALUES(?,?,?,?,?,?,?,?)`,
          )
          .bind(
            id,
            value.username,
            value.email,
            value.displayName,
            password.hash,
            password.salt,
            password.iterations,
            value.email ? 1 : 0,
          )
          .run();
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/app_users\.email|email/i.test(message))
          throw new ApiAccessError("这个邮箱已经绑定到其他账号", 409);
        if (/UNIQUE/i.test(message))
          throw new ApiAccessError("这个账号已存在", 409);
        throw error;
      }
      await adoptOrProvisionVault(id, value.displayName, firstAccount);
      user = {
        id,
        username: value.username,
        displayName: value.displayName,
        avatarUrl: null,
      };
    } else {
      const identifier = normalizeUsername(body.username);
      const email = identifier.includes("@") ? normalizeEmail(identifier) : "";
      const password = String(body.password ?? "");
      const row = await db
        .prepare(
          `SELECT id,username,display_name displayName,avatar_url avatarUrl,password_hash passwordHash,
                  password_salt passwordSalt,password_iterations passwordIterations,
                  password_enabled passwordEnabled
           FROM app_users WHERE (username=? OR email=?) AND disabled=0`,
        )
        .bind(identifier, email)
        .first<{
          id: string;
          username: string;
          displayName: string;
          avatarUrl: string | null;
          passwordHash: string;
          passwordSalt: string;
          passwordIterations: number;
          passwordEnabled: number;
        }>();
      const valid = row?.passwordEnabled
        ? await verifyPassword(
            password,
            row.passwordHash,
            row.passwordSalt,
            row.passwordIterations,
          )
        : await verifyPassword(
            password || "invalid-password",
            "0".repeat(64),
            "0".repeat(32),
            240_000,
          );
      if (!row || !row.passwordEnabled || !valid)
        throw new ApiAccessError("账号、邮箱或密码不正确", 401);
      user = row;
    }

    await db
      .prepare("DELETE FROM app_sessions WHERE expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')")
      .run();
    const session = await createSession(user.id, request);
    const response = NextResponse.json({
      authenticated: true,
      user: {
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    });
    response.headers.set("Set-Cookie", session.cookie);
    return response;
  } catch (error) {
    return accessErrorResponse(error, "登录失败");
  }
}

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    await enforceAuthRateLimit(request, "account");
    const session = await sessionUserFromRequest(request);
    if (!session) throw new ApiAccessError("请先登录后再更新账号", 401);
    const body = (await request.json()) as {
      email?: string;
      code?: string;
      currentPassword?: string;
      newPassword?: string;
      avatarUrl?: string | null;
    };
    const updatesAvatar = Object.prototype.hasOwnProperty.call(body, "avatarUrl");
    const updatesEmail = Object.prototype.hasOwnProperty.call(body, "email");
    if (updatesAvatar) {
      if (updatesEmail)
        throw new ApiAccessError("请分别更新头像和绑定邮箱", 400);
      const avatarUrl =
        body.avatarUrl === null ? null : validateAvatarDataUrl(body.avatarUrl);
      await getDbBinding()
        .prepare(
          "UPDATE app_users SET avatar_url=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND disabled=0",
        )
        .bind(avatarUrl, session.id)
        .run();
      return NextResponse.json({ ok: true, avatarUrl });
    }
    const email = validateEmail(body.email);
    if (!email) throw new ApiAccessError("请输入邮箱地址", 400);
    // 绑定/更换邮箱同样要验证码，确认这个邮箱确实归本人所有。
    await consumeEmailCode({
      email,
      purpose: "bind",
      code: String(body.code ?? ""),
    });
    const db = getDbBinding();
    const row = await db
      .prepare(
        `SELECT password_hash passwordHash,password_salt passwordSalt,
                password_iterations passwordIterations,password_enabled passwordEnabled
         FROM app_users WHERE id=? AND disabled=0`,
      )
      .bind(session.id)
      .first<{
        passwordHash: string;
        passwordSalt: string;
        passwordIterations: number;
        passwordEnabled: number;
      }>();
    if (!row) throw new ApiAccessError("账号不存在或已停用", 401);
    let passwordUpdate:
      | { hash: string; salt: string; iterations: number }
      | null = null;
    if (row.passwordEnabled) {
      const valid = await verifyPassword(
        String(body.currentPassword ?? ""),
        row.passwordHash,
        row.passwordSalt,
        row.passwordIterations,
      );
      if (!valid) throw new ApiAccessError("当前密码不正确", 401);
    } else {
      const nextPassword = String(body.newPassword ?? "");
      if (nextPassword.length < 8 || nextPassword.length > 72)
        throw new ApiAccessError("请设置 8—72 位邮箱登录密码", 400);
      passwordUpdate = await passwordRecord(nextPassword);
    }
    try {
      if (passwordUpdate)
        await db
          .prepare(
            `UPDATE app_users SET email=?,password_hash=?,password_salt=?,password_iterations=?,
                    password_enabled=1,email_verified=1,
                    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
          )
          .bind(
            email,
            passwordUpdate.hash,
            passwordUpdate.salt,
            passwordUpdate.iterations,
            session.id,
          )
          .run();
      else
        await db
          .prepare(
            "UPDATE app_users SET email=?,email_verified=1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
          )
          .bind(email, session.id)
          .run();
    } catch (error) {
      if (/UNIQUE|email/i.test(error instanceof Error ? error.message : ""))
        throw new ApiAccessError("这个邮箱已经绑定到其他账号", 409);
      throw error;
    }
    return NextResponse.json({ ok: true, email });
  } catch (error) {
    return accessErrorResponse(error, "更新账号失败");
  }
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const deletesAccount =
      new URL(request.url).searchParams.get("action") === "delete-account";
    if (deletesAccount) {
      await enforceAuthRateLimit(request, "account");
      const session = await sessionUserFromRequest(request);
      if (!session) throw new ApiAccessError("请先登录后再注销账号", 401);
      const body = (await request.json()) as {
        currentPassword?: string;
        confirmation?: string;
      };
      if (String(body.confirmation ?? "").trim() !== "删除账号")
        throw new ApiAccessError("请输入“删除账号”确认操作", 400);
      const db = getDbBinding();
      const row = await db
        .prepare(
          `SELECT password_hash passwordHash,password_salt passwordSalt,
                  password_iterations passwordIterations,password_enabled passwordEnabled
           FROM app_users WHERE id=? AND disabled=0`,
        )
        .bind(session.id)
        .first<{
          passwordHash: string;
          passwordSalt: string;
          passwordIterations: number;
          passwordEnabled: number;
        }>();
      if (!row || !row.passwordEnabled)
        throw new ApiAccessError("当前账号不支持密码注销", 400);
      const valid = await verifyPassword(
        String(body.currentPassword ?? ""),
        row.passwordHash,
        row.passwordSalt,
        row.passwordIterations,
      );
      if (!valid) throw new ApiAccessError("当前密码不正确", 401);
      const ownerId = `user:${session.id}`;
      const deletedUsername = `deleted_${session.id.replaceAll("-", "")}`;
      await ensureIntegrationTokenTable();
      await db.batch([
        db
          .prepare(
            `UPDATE app_users SET username=?,email=NULL,display_name='已注销账号',avatar_url=NULL,
                    password_hash='',password_salt='',password_enabled=0,disabled=1,
                    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
          )
          .bind(deletedUsername, session.id),
        db.prepare("DELETE FROM app_sessions WHERE user_id=?").bind(session.id),
        db.prepare("DELETE FROM app_identities WHERE user_id=?").bind(session.id),
        db.prepare("DELETE FROM oauth_states WHERE user_id=?").bind(session.id),
        db.prepare("DELETE FROM email_codes WHERE user_id=?").bind(session.id),
        db.prepare("DELETE FROM user_preferences WHERE owner_id=?").bind(ownerId),
        db.prepare("DELETE FROM api_rate_limits WHERE owner_id=?").bind(ownerId),
        db.prepare("DELETE FROM integration_tokens WHERE owner_id=?").bind(ownerId),
      ]);
      const cookie = await revokeRequestSession(request);
      const response = NextResponse.json({ ok: true });
      response.headers.set("Set-Cookie", cookie);
      return response;
    }
    const cookie = await revokeRequestSession(request);
    const response = NextResponse.json({ ok: true });
    response.headers.set("Set-Cookie", cookie);
    return response;
  } catch (error) {
    return accessErrorResponse(error, "退出失败");
  }
}
