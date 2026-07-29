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
  return { username, displayName, password, email };
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
