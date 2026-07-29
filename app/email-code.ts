import { ensureDb, getDbBinding } from "../db";
import { ApiAccessError } from "./api-security";
import { authTokenDigest } from "./auth";
import {
  RESEND_INTERVAL_MS,
  canSendCode,
  codeExpiryFrom,
  generateCode,
  normalizeCodeInput,
  verifyCodeRecord,
} from "./email-code-core.js";
import { sendMail, verificationMail, mailerStatus } from "./mailer";

export type CodePurpose = "register" | "bind" | "reset";

type CodeRow = {
  id: number;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  consumedAt: string | null;
  userId: string | null;
};

/** 验证码本身也做哈希存储，数据库泄露时不能直接拿去用。 */
async function codeDigest(email: string, purpose: string, code: string) {
  return authTokenDigest(`${email}|${purpose}|${code}`);
}

/**
 * 发送验证码。只有真正的发信通道可用时才创建验证码。
 * 出于安全考虑，即使邮箱不存在也不会告诉调用方，避免被用来枚举注册用户。
 */
export async function issueEmailCode(input: {
  email: string;
  purpose: CodePurpose;
  userId?: string | null;
}) {
  if (!mailerStatus().configured)
    throw new ApiAccessError("邮件服务未配置，暂时无法发送验证码", 503);
  await ensureDb();
  const db = getDbBinding();
  const now = Date.now();

  const recent = await db
    .prepare(
      `SELECT created_at AS createdAt FROM email_codes
       WHERE email=? AND purpose=? ORDER BY id DESC LIMIT 1`,
    )
    .bind(input.email, input.purpose)
    .first<{ createdAt: string }>();
  const hourly = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM email_codes
       WHERE email=? AND created_at > datetime('now','-1 hour')`,
    )
    .bind(input.email)
    .first<{ n: number }>();

  const gate = canSendCode(
    {
      lastSentAt: recent ? Date.parse(`${recent.createdAt}Z`) : 0,
      sentWithinHour: Number(hourly?.n ?? 0),
    },
    now,
  );
  if (!gate.ok)
    throw new ApiAccessError(gate.reason, 429);

  const code = generateCode();
  const expiresAt = new Date(codeExpiryFrom(now)).toISOString();
  await db
    .prepare(
      `INSERT INTO email_codes(email,purpose,code_hash,user_id,expires_at)
       VALUES(?,?,?,?,?)`,
    )
    .bind(
      input.email,
      input.purpose,
      await codeDigest(input.email, input.purpose, code),
      input.userId ?? null,
      expiresAt,
    )
    .run();

  // 顺手清理过期记录，避免表无限增长。
  await db
    .prepare("DELETE FROM email_codes WHERE created_at < datetime('now','-1 day')")
    .run();

  const mail = verificationMail(code, input.purpose);
  const result = await sendMail({ to: input.email, ...mail });
  if (!result.ok) {
    await db
      .prepare("DELETE FROM email_codes WHERE email=? AND purpose=? AND code_hash=?")
      .bind(
        input.email,
        input.purpose,
        await codeDigest(input.email, input.purpose, code),
      )
      .run();
    throw new ApiAccessError(result.error ?? "邮件发送失败", 502);
  }
  return {
    resendAfterMs: RESEND_INTERVAL_MS,
    configured: mailerStatus().configured,
  };
}

/**
 * 校验验证码。成功后立即标记为已消费，确保一码一用。
 * 校验失败会累加尝试次数，避免被暴力枚举 6 位数字。
 */
export async function consumeEmailCode(input: {
  email: string;
  purpose: CodePurpose;
  code: string;
}) {
  await ensureDb();
  const db = getDbBinding();
  const code = normalizeCodeInput(input.code);
  const row = await db
    .prepare(
      `SELECT id,code_hash AS codeHash,expires_at AS expiresAt,attempts,
              consumed_at AS consumedAt,user_id AS userId
       FROM email_codes WHERE email=? AND purpose=? ORDER BY id DESC LIMIT 1`,
    )
    .bind(input.email, input.purpose)
    .first<CodeRow>();

  const verdict = verifyCodeRecord(
    row
      ? {
          codeHash: row.codeHash,
          expiresAt: Date.parse(row.expiresAt),
          attempts: Number(row.attempts ?? 0),
          consumedAt: row.consumedAt ? Date.parse(row.consumedAt) : null,
        }
      : null,
    code ? await codeDigest(input.email, input.purpose, code) : "",
    Date.now(),
  );

  if (!verdict.ok) {
    if (row && !row.consumedAt)
      await db
        .prepare("UPDATE email_codes SET attempts=attempts+1 WHERE id=?")
        .bind(row.id)
        .run();
    throw new ApiAccessError(verdict.reason, 400);
  }

  await db
    .prepare(
      "UPDATE email_codes SET consumed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
    )
    .bind(row!.id)
    .run();
  return { userId: row!.userId };
}
