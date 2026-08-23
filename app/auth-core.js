import { PASSWORD_DENYLIST } from "./password-denylist.js";

export const SESSION_COOKIE_NAME = "neo_ledger_session";

export function normalizeUsername(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * @param {unknown} value
 * @param {{optional?: boolean}} [options]
 * @returns {string|null} optional 为 true 且留空时返回 null（保持数据库里存 NULL，
 *   否则空串会撞上 app_users 的 “email IS NOT NULL” 部分唯一索引）
 */
export function validateEmail(value, { optional = false } = {}) {
  const email = normalizeEmail(value);
  if (!email && optional) return null;
  if (
    email.length > 254 ||
    !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/u.test(email)
  )
    throw new Error("请输入有效的邮箱地址");
  return email;
}

export function validateRegistrationInput(input) {
  const username = normalizeUsername(input?.username);
  const displayName = String(input?.displayName ?? "").trim().slice(0, 30);
  const password = String(input?.password ?? "");
  const email = validateEmail(input?.email, { optional: true });
  const usernameIsEmail = username.includes("@");
  if (usernameIsEmail) {
    const accountEmail = validateEmail(username);
    if (!email || email !== accountEmail)
      throw new Error("邮箱账号需与验证邮箱一致");
  } else if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    throw new Error("账号需为邮箱，或 3—32 位字母、数字、点、横线或下划线");
  }
  if (!displayName) throw new Error("请输入显示名称");
  if (password.length < 8 || password.length > 72)
    throw new Error("密码需为 8—72 位");
  validatePasswordStrength(password);
  return { username, displayName, password, email };
}

export function validatePasswordStrength(password) {
  const lowered = String(password).toLowerCase();
  if (PASSWORD_DENYLIST.has(lowered) || /^(.)\1{7,}$/u.test(password) || /0123456789|9876543210/u.test(password))
    throw new Error("密码过于常见，请使用密码管理器生成的随机密码");
}

/**
 * A client-safe explanation that mirrors the server validation without
 * exposing the password itself. Keep this separate from validation so forms
 * can give useful feedback before submission while the server remains the
 * authoritative gate.
 */
export function passwordStrengthHint(password) {
  const value = String(password ?? "");
  if (!value) return "";
  if (value.length < 8) return "至少 8 位";
  try {
    validatePasswordStrength(value);
  } catch {
    return "密码过于常见或可预测，请换用密码管理器生成的随机密码";
  }
  const classes = [
    /[a-z]/u.test(value),
    /[A-Z]/u.test(value),
    /\d/u.test(value),
    /[^A-Za-z0-9]/u.test(value),
  ].filter(Boolean).length;
  return value.length >= 12 && classes >= 3 ? "密码强度：较强" : "密码强度：可用";
}

export function parseCookieValue(header, name) {
  for (const part of String(header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

export function sessionCookie(token, { secure = false, maxAge = 2592000 } = {}) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
