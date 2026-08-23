import { ensureDb, getDbBinding } from "../db";
import {
  parseCookieValue,
  SESSION_COOKIE_NAME,
  sessionCookie,
} from "./auth-core.js";

const PASSWORD_ITERATIONS = 240_000;
const SESSION_SECONDS = 30 * 24 * 60 * 60;
export const MAX_AVATAR_BYTES = 512 * 1024;

export type AvatarMimeType = "image/jpeg" | "image/png" | "image/webp";

export type AuthUser = {
  id: string;
  ownerId: string;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  provider: "local" | "chatgpt";
};

export class AuthRateLimitError extends Error {
  status = 429;
  retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = "AuthRateLimitError";
    this.retryAfter = Math.max(1, Math.ceil(retryAfter));
  }
}

export class AuthOriginError extends Error {
  status = 403;

  constructor(message = "登录请求来源无效") {
    super(message);
    this.name = "AuthOriginError";
  }
}

const bytesToHex = (bytes: Uint8Array) =>
  [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");

const hexToBytes = (hex: string) =>
  Uint8Array.from(
    hex.match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)) ?? [],
  );

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
};

function hasAvatarSignature(mimeType: AvatarMimeType, bytes: Uint8Array) {
  if (mimeType === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  if (mimeType === "image/png")
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export function avatarDataUrlFromBytes(
  mimeType: AvatarMimeType,
  bytes: Uint8Array,
) {
  if (!bytes.length) throw new Error("头像图片不能为空");
  if (bytes.length > MAX_AVATAR_BYTES)
    throw new Error("头像图片不能超过 512 KB");
  if (!hasAvatarSignature(mimeType, bytes))
    throw new Error("头像图片内容与格式不匹配");
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

export function validateAvatarDataUrl(value: unknown) {
  if (typeof value !== "string")
    throw new Error("头像必须是 JPEG、PNG 或 WebP 图片");
  // The encoded-length check prevents a large allocation before decoding.
  if (value.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 64)
    throw new Error("头像图片不能超过 512 KB");
  const match = value.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match || match[2].length % 4 !== 0)
    throw new Error("头像必须是 JPEG、PNG 或 WebP 的 Base64 图片");
  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    throw new Error("头像 Base64 数据无效");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const mimeType = match[1] as AvatarMimeType;
  if (bytesToBase64(bytes) !== match[2])
    throw new Error("头像 Base64 数据无效");
  return avatarDataUrlFromBytes(mimeType, bytes);
}

export async function authTokenDigest(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

async function derivePassword(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = PASSWORD_ITERATIONS,
) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1)
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

export async function passwordRecord(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    hash: await derivePassword(password, salt),
    salt: bytesToHex(salt),
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
  iterations: number,
) {
  const actual = await derivePassword(password, hexToBytes(salt), iterations);
  return constantTimeEqual(actual, hash);
}

export async function hasLocalUsers() {
  await ensureDb();
  const row = await getDbBinding()
    .prepare("SELECT COUNT(*) count FROM app_users WHERE disabled=0")
    .first<{ count: number }>();
  return Number(row?.count ?? 0) > 0;
}

export async function sessionUser(token: string): Promise<AuthUser | null> {
  if (!/^nls_[A-Za-z0-9_-]{32,}$/.test(token)) return null;
  await ensureDb();
  const tokenHash = await authTokenDigest(token);
  const db = getDbBinding();
  const row = await db
    .prepare(
      `SELECT u.id,u.username,u.display_name displayName,u.email,u.avatar_url avatarUrl
       FROM app_sessions s JOIN app_users u ON u.id=s.user_id
       WHERE s.token_hash=? AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
         AND s.last_used_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-14 days')
         AND NOT EXISTS (
           SELECT 1 FROM app_session_devices d
           WHERE d.token_hash=s.token_hash
             AND (d.revoked_at IS NOT NULL OR d.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         )
         AND u.disabled=0`,
    )
    .bind(tokenHash)
    .first<{
      id: string;
      username: string;
      displayName: string;
      email: string | null;
      avatarUrl: string | null;
    }>();
  if (!row) return null;
  await db.batch([
    db
      .prepare(
        "UPDATE app_sessions SET last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=?",
      )
      .bind(tokenHash),
    db
      .prepare(
        "UPDATE app_session_devices SET last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=? AND revoked_at IS NULL",
      )
      .bind(tokenHash),
  ]);
  return {
    id: row.id,
    ownerId: `user:${row.id}`,
    username: row.username,
    displayName: row.displayName,
    email: row.email,
    avatarUrl: row.avatarUrl,
    provider: "local",
  };
}

export async function sessionUserFromRequest(request: Request) {
  const token = parseCookieValue(
    request.headers.get("cookie"),
    SESSION_COOKIE_NAME,
  );
  return token ? sessionUser(token) : null;
}

export async function createSession(userId: string, request: Request) {
  await ensureDb();
  const token = `nls_${bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))}`;
  const tokenHash = await authTokenDigest(token);
  const deviceId = crypto.randomUUID();
  const db = getDbBinding();
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300) || null;
  const ipAddress = (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    ""
  ).trim().slice(0, 80) || null;
  await db.batch([
    db
      .prepare(
        `INSERT INTO app_sessions(token_hash,user_id,expires_at)
         VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days'))`,
      )
      .bind(tokenHash, userId),
    db
      .prepare(
        `INSERT INTO app_session_devices(id,token_hash,user_id,display_name,user_agent,ip_address,expires_at)
         VALUES(?,?,?,'浏览器',?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days'))`,
      )
      .bind(deviceId, tokenHash, userId, userAgent, ipAddress),
  ]);
  const secure =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  return {
    id: deviceId,
    token,
    cookie: sessionCookie(token, { secure, maxAge: SESSION_SECONDS }),
  };
}

export async function revokeRequestSession(request: Request) {
  const token = parseCookieValue(
    request.headers.get("cookie"),
    SESSION_COOKIE_NAME,
  );
  if (token) {
    await ensureDb();
    const tokenHash = await authTokenDigest(token);
    await getDbBinding().batch([
      getDbBinding().prepare("DELETE FROM app_sessions WHERE token_hash=?").bind(tokenHash),
      getDbBinding()
        .prepare("UPDATE app_session_devices SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=?")
        .bind(tokenHash),
    ]);
  }
  const secure =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  return sessionCookie("", { secure, maxAge: 0 });
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new AuthOriginError();
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite))
    throw new AuthOriginError();
}

export async function enforceAuthRateLimit(request: Request, scope: string) {
  await ensureDb();
  const ip = String(
    request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      "local",
  ).slice(0, 80);
  const windowStart = Math.floor(Date.now() / 900_000);
  const db = getDbBinding();
  // 认证限流桶按 15 分钟计数；保留 24 小时足够支持排障与当前窗口重试，
  // 并明确限定 auth 前缀，避免误删使用“分钟窗口”的集成令牌限流桶。
  await db
    .prepare(
      "DELETE FROM api_rate_limits WHERE owner_id LIKE 'auth:%' AND scope LIKE 'auth:%' AND window_start<?",
    )
    .bind(windowStart - 96)
    .run();
  await db
    .prepare(
      `INSERT INTO api_rate_limits(owner_id,scope,window_start,count)
       VALUES(?,?,?,1)
       ON CONFLICT(owner_id,scope,window_start) DO UPDATE SET count=count+1`,
    )
    .bind(`auth:${ip}`, `auth:${scope}`, windowStart)
    .run();
  const row = await db
    .prepare(
      "SELECT count FROM api_rate_limits WHERE owner_id=? AND scope=? AND window_start=?",
    )
    .bind(`auth:${ip}`, `auth:${scope}`, windowStart)
    .first<{ count: number }>();
  if (Number(row?.count ?? 0) > (scope === "register" ? 5 : 12)) {
    const windowEndsAt = (windowStart + 900_000) / 1000;
    throw new AuthRateLimitError(
      "尝试次数过多，请稍后再试",
      windowEndsAt - Date.now() / 1000,
    );
  }
}

export async function adoptOrProvisionVault(
  userId: string,
  displayName: string,
  adoptLocal: boolean,
) {
  const db = getDbBinding();
  const ownerId = `user:${userId}`;
  if (adoptLocal) {
    await db.batch([
      db
        .prepare(
          "UPDATE ledgers SET owner_id=? WHERE owner_id IS NULL OR owner_id='local'",
        )
        .bind(ownerId),
      db
        .prepare(
          "UPDATE sync_tombstones SET owner_id=? WHERE owner_id IS NULL OR owner_id='local'",
        )
        .bind(ownerId),
      db
        .prepare(
          `INSERT OR IGNORE INTO user_preferences(owner_id,theme,lock_enabled,pin_hash,pin_salt,pin_iterations)
          SELECT ?,theme,lock_enabled,pin_hash,pin_salt,pin_iterations FROM user_preferences WHERE owner_id='local'`,
       )
       .bind(ownerId),
      db
        .prepare(
          "UPDATE restore_snapshots SET owner_id=? WHERE owner_id IS NULL OR owner_id='local'",
        )
        .bind(ownerId),
   ]);
  }
  const owned = await db
    .prepare("SELECT id FROM ledgers WHERE owner_id=? ORDER BY id LIMIT 1")
    .bind(ownerId)
    .first<{ id: number }>();
  if (owned) return owned.id;

  const ledger = await db
    .prepare(
      "INSERT INTO ledgers(name,icon,owner_id,uuid,updated_at) VALUES(?,'🏠',?,lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    )
    .bind(`${displayName}的账本`.slice(0, 30), ownerId)
    .run();
  const ledgerId = Number(ledger.meta.last_row_id);
  await db.batch([
    db.prepare("INSERT INTO budget_settings(id,amount) VALUES(?,500000)").bind(ledgerId),
    db.prepare("INSERT INTO category_budgets(ledger_id,category,amount) VALUES(?,'餐饮',0),(?,'交通',0),(?,'购物',0),(?,'咖啡',30000),(?,'娱乐',50000)").bind(ledgerId, ledgerId, ledgerId, ledgerId, ledgerId),
    db.prepare("INSERT INTO expense_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) VALUES(?,'餐饮','🍔','#e98565','餐饮',1,10),(?,'交通','🚇','#84a28d','交通',1,20),(?,'购物','🛍️','#c98fa7','购物',1,30),(?,'咖啡','☕','#ae8566','咖啡',1,40),(?,'娱乐','🎮','#858cbd','娱乐',1,50)").bind(ledgerId, ledgerId, ledgerId, ledgerId, ledgerId),
    db.prepare("INSERT INTO income_categories(ledger_id,name,icon,color,builtin_key,is_system,sort_order) VALUES(?,'薪资发放','💼','#4f9b78','薪资发放',1,10),(?,'理财收益','📈','#78b899','理财收益',1,20),(?,'兼职外快','🧧','#d19a5d','兼职外快',1,30),(?,'其它收入','🎁','#8f91b8','其它收入',1,40)").bind(ledgerId, ledgerId, ledgerId, ledgerId),
    db.prepare("INSERT INTO members(ledger_id,name,icon,is_me) VALUES(?,'我','🧑',1)").bind(ledgerId),
    db.prepare("INSERT INTO fire_settings(ledger_id) VALUES(?)").bind(ledgerId),
    db.prepare("INSERT INTO economic_settings(ledger_id) VALUES(?)").bind(ledgerId),
    db.prepare("INSERT INTO accounts(ledger_id,name,type,current_balance,icon,initial_balance,currency,asset_class,uuid,updated_at) VALUES(?,'现金账户','资产',0,'💰',0,'CNY','现金流',lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'))").bind(ledgerId),
    db.prepare("INSERT OR IGNORE INTO user_preferences(owner_id) VALUES(?)").bind(ownerId),
  ]);
  return ledgerId;
}
