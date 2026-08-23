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
  validatePasswordStrength,
} from "../../auth-core.js";
import { consumeEmailCode } from "../../email-code";
import { ensureIntegrationTokenTable } from "../../integration-token";
import { oauthProviderStatus } from "../../oauth";
import { verifyTotp } from "../../totp";
import { consumeRecoveryCode, remainingRecoveryCodes } from "../../mfa-recovery";
import { recordAuditEvent, requestIdFromRequest } from "../../audit-log";
import { MAX_AUTH_BODY_BYTES, readJsonWithLimit } from "../../request-limits";

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
    const mfa = user
      ? await db
          .prepare("SELECT enabled FROM user_mfa WHERE user_id=?")
          .bind(user.id)
          .first<{ enabled: number }>()
      : null;
    return privateJson({
      authenticated: Boolean(user),
      hasUsers: await hasLocalUsers(),
      providers: oauthProviderStatus(),
      linkedProviders: linked.results.map((row) => row.provider),
      passwordEnabled: Boolean(password?.passwordEnabled),
      mfaEnabled: Boolean(mfa?.enabled),
      recoveryCodesRemaining:
        user && mfa?.enabled ? await remainingRecoveryCodes(user.id) : 0,
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
    return accessErrorResponse(error, "读取账号状态失败", request);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureDb();
    const body = await readJsonWithLimit<{
      action?: "login" | "register";
      username?: string;
      email?: string;
      displayName?: string;
      password?: string;
      mfaCode?: string;
    }>(request, MAX_AUTH_BODY_BYTES);
    const action = body.action === "register" ? "register" : "login";
    await enforceAuthRateLimit(request, action);
    const db = getDbBinding();
    let user: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
    };
    let mfaRecoveryUsed = false;

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
                  password_enabled passwordEnabled,
                  m.secret mfaSecret,m.enabled mfaEnabled,m.last_used_step mfaLastUsedStep
           FROM app_users u LEFT JOIN user_mfa m ON m.user_id=u.id
           WHERE (u.username=? OR u.email=?) AND u.disabled=0`,
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
          mfaSecret: string | null;
          mfaEnabled: number | null;
          mfaLastUsedStep: number | null;
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
      if (row.mfaEnabled) {
        const mfaCode = String(body.mfaCode ?? "").trim();
        const step = await verifyTotp(row.mfaSecret ?? "", mfaCode);
        if (step != null) {
          const claimed = await db
            .prepare(
              `UPDATE user_mfa SET last_used_step=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
               WHERE user_id=? AND enabled=1 AND (last_used_step IS NULL OR last_used_step<?)`,
            )
            .bind(step, row.id, step)
            .run();
          if (!claimed.meta.changes)
            throw new ApiAccessError("这个二次验证码已经使用", 401);
        } else {
          mfaRecoveryUsed = await consumeRecoveryCode(row.id, mfaCode);
          if (!mfaRecoveryUsed)
            throw new ApiAccessError("请输入有效的二次验证码或恢复码", 401);
        }
      }
      user = row;
    }

    await db
      .prepare("DELETE FROM app_sessions WHERE expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')")
      .run();
    await db
      .prepare("DELETE FROM app_session_devices WHERE expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') OR revoked_at IS NOT NULL")
      .run();
    const session = await createSession(user.id, request);
    const recoveryCodesRemaining = mfaRecoveryUsed
      ? await remainingRecoveryCodes(user.id)
      : undefined;
    const response = privateJson({
      authenticated: true,
      mfaRecoveryUsed,
      recoveryCodesRemaining,
      user: {
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    });
    response.headers.set("Set-Cookie", session.cookie);
    await recordAuditEvent({
      ownerId: `user:${user.id}`,
      eventType: action === "register" ? "auth.register" : "auth.login",
      subjectType: "user",
      subjectId: user.id,
      requestId: requestIdFromRequest(request),
      metadata: {
        mfa: action === "login" && Boolean((user as { mfaEnabled?: number }).mfaEnabled),
        mfaRecoveryUsed,
      },
    });
    if (mfaRecoveryUsed)
      await recordAuditEvent({
        ownerId: `user:${user.id}`,
        eventType: "mfa.recovery_use",
        subjectType: "user",
        subjectId: user.id,
        requestId: requestIdFromRequest(request),
        metadata: { remaining: recoveryCodesRemaining ?? 0 },
      });
    return response;
  } catch (error) {
    return accessErrorResponse(error, "登录失败", request);
  }
}

export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    await enforceAuthRateLimit(request, "account");
    const session = await sessionUserFromRequest(request);
    if (!session) throw new ApiAccessError("请先登录后再更新账号", 401);
    const body = await readJsonWithLimit<{
      email?: string;
      code?: string;
      currentPassword?: string;
      newPassword?: string;
      avatarUrl?: string | null;
    }>(request, MAX_AUTH_BODY_BYTES);
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
      return privateJson({ ok: true, avatarUrl });
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
      validatePasswordStrength(nextPassword);
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
    return privateJson({ ok: true, email });
  } catch (error) {
    return accessErrorResponse(error, "更新账号失败", request);
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
      const body = await readJsonWithLimit<{
        currentPassword?: string;
        confirmation?: string;
        mfaCode?: string;
      }>(request, MAX_AUTH_BODY_BYTES);
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
      const ownerId = `user:${session.id}`;
      if (!row) throw new ApiAccessError("账号不存在或已停用", 401);
      if (row.passwordEnabled) {
        const valid = await verifyPassword(
          String(body.currentPassword ?? ""),
          row.passwordHash,
          row.passwordSalt,
          row.passwordIterations,
        );
        if (!valid) throw new ApiAccessError("当前密码不正确", 401);
      } else {
        const mfa = await db
          .prepare("SELECT secret,enabled FROM user_mfa WHERE user_id=?")
          .bind(session.id)
          .first<{ secret: string; enabled: number }>();
        if (mfa?.enabled) {
          const step = await verifyTotp(mfa.secret, String(body.mfaCode ?? ""));
          if (step == null)
            throw new ApiAccessError("请提供有效的二次验证码后再注销账号", 401);
          const claimed = await db
            .prepare(
              "UPDATE user_mfa SET last_used_step=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND enabled=1 AND (last_used_step IS NULL OR last_used_step<?)",
            )
            .bind(step, session.id, step)
            .run();
          if (!claimed.meta.changes)
            throw new ApiAccessError("这个验证码已经使用，请等待验证器刷新", 409);
        }
      }
      const deletedUsername = `deleted_${session.id.replaceAll("-", "")}`;
      await ensureIntegrationTokenTable();
      await db.batch([
        // 先清除所有按 owner 或 ledger 归属的数据，再匿名化账号。
        // 审计事件保留最小化操作记录，供安全追溯；不保留账单正文或认证秘密。
        db.prepare("DELETE FROM restore_snapshot_chunks WHERE snapshot_id IN (SELECT id FROM restore_snapshots WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM restore_snapshot_commits WHERE snapshot_id IN (SELECT id FROM restore_snapshots WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM restore_snapshots WHERE owner_id=?").bind(ownerId),
        db.prepare("DELETE FROM restore_locks WHERE owner_id=?").bind(ownerId),
        db.prepare("DELETE FROM import_batch_items WHERE batch_id IN (SELECT id FROM import_batches WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM import_batches WHERE owner_id=?").bind(ownerId),
        db.prepare("DELETE FROM automation_rules WHERE owner_id=?").bind(ownerId),
        db.prepare("DELETE FROM integration_events WHERE owner_id=?").bind(ownerId),
        db.prepare("DELETE FROM peer_presence WHERE owner_id=?").bind(ownerId),
        db.prepare("DELETE FROM nearby_packages WHERE owner_id=?").bind(ownerId),
        db.prepare("DELETE FROM api_rate_limits WHERE owner_id=?").bind(ownerId),
        db.prepare("DELETE FROM user_preferences WHERE owner_id=?").bind(ownerId),
        db.prepare("DELETE FROM integration_tokens WHERE owner_id=?").bind(ownerId),
        db.prepare("DELETE FROM sync_tombstones WHERE owner_id=? OR ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId, ownerId),
        db.prepare("DELETE FROM transaction_reconciliation WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM scheduled_occurrences WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM account_transfers WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM side_hustle_deductions WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM pending_transactions WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM system_notifications WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM fire_settings WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM economic_settings WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM crdt_tombstones WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM digital_assets WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM expense_categories WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM income_categories WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM transactions WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM installments WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM achievements WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM subscriptions WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM savings_goals WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM category_budgets WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM members WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM accounts WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM budget_settings WHERE id IN (SELECT id FROM ledgers WHERE owner_id=?)").bind(ownerId),
        db.prepare("DELETE FROM ledgers WHERE owner_id=?").bind(ownerId),
        db.prepare("DELETE FROM user_passkeys WHERE user_id=?").bind(session.id),
        db.prepare("DELETE FROM webauthn_challenges WHERE user_id=?").bind(session.id),
        db.prepare("DELETE FROM user_mfa_recovery_codes WHERE user_id=?").bind(session.id),
        db.prepare("DELETE FROM user_mfa WHERE user_id=?").bind(session.id),
        db.prepare("DELETE FROM app_identities WHERE user_id=?").bind(session.id),
        db.prepare("DELETE FROM oauth_states WHERE user_id=?").bind(session.id),
        db.prepare("DELETE FROM email_codes WHERE user_id=?").bind(session.id),
        db.prepare("DELETE FROM app_sessions WHERE user_id=?").bind(session.id),
        db.prepare("DELETE FROM app_session_devices WHERE user_id=?").bind(session.id),
        db
          .prepare(
            `UPDATE app_users SET username=?,email=NULL,display_name='已注销账号',avatar_url=NULL,
                    password_hash='',password_salt='',password_enabled=0,disabled=1,
                    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
          )
          .bind(deletedUsername, session.id),
      ]);
      await recordAuditEvent({
        ownerId,
        eventType: "auth.delete_account",
        subjectType: "user",
        subjectId: session.id,
        requestId: requestIdFromRequest(request),
      });
      const cookie = await revokeRequestSession(request);
      const response = privateJson({ ok: true });
      response.headers.set("Set-Cookie", cookie);
      return response;
    }
    const session = await sessionUserFromRequest(request);
    const cookie = await revokeRequestSession(request);
    if (session)
      await recordAuditEvent({
        ownerId: session.ownerId,
        eventType: "auth.logout",
        subjectType: "user",
        subjectId: session.id,
        requestId: requestIdFromRequest(request),
      });
    const response = privateJson({ ok: true });
    response.headers.set("Set-Cookie", cookie);
    return response;
  } catch (error) {
    return accessErrorResponse(error, "退出失败", request);
  }
}
