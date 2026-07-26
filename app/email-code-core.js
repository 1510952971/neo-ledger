// 邮箱验证码的纯逻辑：不碰数据库、不发网络请求，便于用 node --test 直接覆盖。

export const EMAIL_CODE_PURPOSES = ["register", "bind", "reset"];

// 验证码 10 分钟有效；同一邮箱 60 秒内只能再要一次；单个验证码最多试 5 次。
export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_INTERVAL_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;
// 同一邮箱一小时内最多发 5 封，防止被人拿去骚扰别人的邮箱。
export const HOURLY_SEND_LIMIT = 5;

export function normalizeCodePurpose(value) {
  const purpose = String(value ?? "").trim();
  return EMAIL_CODE_PURPOSES.includes(purpose) ? purpose : null;
}

export function generateCode(randomValues) {
  // 6 位数字，避免 0/O、1/l 之类的手输歧义。
  const source =
    randomValues ?? crypto.getRandomValues(new Uint8Array(6));
  return [...source].map((byte) => String(byte % 10)).join("");
}

export function normalizeCodeInput(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 6);
}

/**
 * 判断这次发码请求是否放行。
 * @param {{lastSentAt?: number|null, sentWithinHour?: number}} state
 * @param {number} now
 */
export function canSendCode(state, now = Date.now()) {
  const lastSentAt = Number(state?.lastSentAt ?? 0);
  const sentWithinHour = Number(state?.sentWithinHour ?? 0);
  if (sentWithinHour >= HOURLY_SEND_LIMIT)
    return { ok: false, reason: "发送过于频繁，请一小时后再试", retryAfterMs: 0 };
  if (lastSentAt && now - lastSentAt < RESEND_INTERVAL_MS)
    return {
      ok: false,
      reason: "验证码刚刚发送过，请稍后再试",
      retryAfterMs: RESEND_INTERVAL_MS - (now - lastSentAt),
    };
  return { ok: true, reason: "", retryAfterMs: 0 };
}

/**
 * 校验用户输入的验证码。
 * @param {{codeHash?: string, expiresAt?: number, attempts?: number, consumedAt?: number|null}|null} record
 * @param {string} inputHash 已经哈希过的用户输入
 */
export function verifyCodeRecord(record, inputHash, now = Date.now()) {
  if (!record) return { ok: false, reason: "请先获取验证码" };
  if (record.consumedAt) return { ok: false, reason: "验证码已使用，请重新获取" };
  if (Number(record.attempts ?? 0) >= MAX_ATTEMPTS)
    return { ok: false, reason: "错误次数过多，请重新获取验证码" };
  if (Number(record.expiresAt ?? 0) <= now)
    return { ok: false, reason: "验证码已过期，请重新获取" };
  if (!inputHash || inputHash !== record.codeHash)
    return { ok: false, reason: "验证码不正确" };
  return { ok: true, reason: "" };
}

export function codeExpiryFrom(now = Date.now()) {
  return now + CODE_TTL_MS;
}

/** 在日志或界面里展示邮箱时做脱敏：pengguofu@qq.com -> p*******u@qq.com */
export function maskEmail(value) {
  const email = String(value ?? "");
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const name = email.slice(0, at);
  const domain = email.slice(at);
  if (name.length <= 2) return `${name[0] ?? ""}*${domain}`;
  return `${name[0]}${"*".repeat(name.length - 2)}${name[name.length - 1]}${domain}`;
}
