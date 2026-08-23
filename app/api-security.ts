import { ensureDb, getDbBinding } from "../db";
import { hasLocalUsers, requireSameOrigin, sessionUserFromRequest } from "./auth";
import { configValue } from "./runtime-env";
import { requestIdFromRequest } from "./audit-log";

export class ApiAccessError extends Error {
  status: number;
  retryAfter?: number;

  constructor(message: string, status = 403, retryAfter?: number) {
    super(message);
    this.status = status;
    if (retryAfter != null) this.retryAfter = Math.max(1, Math.ceil(retryAfter));
  }
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * ChatGPT identity headers are forgeable by a normal browser client. They are
 * accepted only when an operator explicitly enables an identity-aware proxy.
 */
export function trustedIdentityProxyEnabled() {
  const value = configValue("NEO_TRUSTED_AUTH_HEADERS").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

const TRUSTED_AUTH_SKEW_SECONDS = 5 * 60;

function validEmail(value: string | null) {
  const email = value?.trim().toLowerCase() ?? "";
  const parts = email?.split("@") ?? [];
  return email &&
    email.length <= 254 &&
    parts.length === 2 &&
    parts[0].length > 0 &&
    parts[0].length <= 64 &&
    parts[1].includes(".") &&
    !/\s/u.test(email)
    ? email
    : null;
}

function decodeBase64Url(value: string) {
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===";
    const binary = atob(padded.slice(0, padded.length - (padded.length % 4)));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function constantTimeBytesEqual(left: Uint8Array, right: Uint8Array) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

function trustedProxySourceAllowed(request: Request) {
  const configured = configValue("NEO_TRUSTED_PROXY_IPS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!configured.length) return false;
  const source = (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    ""
  ).trim();
  return configured.includes(source);
}

async function verifyTrustedChatGPTProof(
  headers: Headers,
  sourceRequest?: Request,
) {
  if (!trustedIdentityProxyEnabled()) return null;
  const email = validEmail(headers.get("oai-authenticated-user-email"));
  const signature = headers.get("x-neo-auth-signature")?.trim() ?? "";
  const timestamp = headers.get("x-neo-auth-timestamp")?.trim() ?? "";
  const nonce = headers.get("x-neo-auth-nonce")?.trim() ?? "";
  const audience = headers.get("x-neo-auth-audience")?.trim() ?? "";
  const secret = configValue("NEO_TRUSTED_AUTH_SECRET");
  const expectedAudience = configValue("NEO_TRUSTED_AUTH_AUDIENCE") || "neo-ledger";
  const numericTimestamp = Number(timestamp);
  if (
    !email ||
    !secret ||
    secret.length < 32 ||
    (sourceRequest && !trustedProxySourceAllowed(sourceRequest)) ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) ||
    audience !== expectedAudience ||
    !Number.isSafeInteger(numericTimestamp) ||
    Math.abs(Math.floor(Date.now() / 1000) - numericTimestamp) > TRUSTED_AUTH_SKEW_SECONDS
  )
    return null;
  const payload = `${email}\n${audience}\n${timestamp}\n${nonce}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  );
  const provided = decodeBase64Url(signature);
  if (!provided || !constantTimeBytesEqual(digest, provided)) return null;
  return { email, nonce, expiresAt: numericTimestamp + TRUSTED_AUTH_SKEW_SECONDS };
}

/**
 * Verify the identity proof emitted by an operator-controlled gateway.
 * The browser must never be able to turn this on: a long-lived HMAC secret,
 * a timestamp, an audience and a one-time nonce are all required.
 */
export async function trustedChatGPTEmailFromRequest(request: Request) {
  const proof = await verifyTrustedChatGPTProof(request.headers, request);
  if (!proof) return null;
  try {
    await ensureDb();
    const db = getDbBinding();
    await db
      .prepare("DELETE FROM trusted_auth_nonces WHERE expires_at<?")
      .bind(Math.floor(Date.now() / 1000))
      .run();
    const inserted = await db
      .prepare("INSERT OR IGNORE INTO trusted_auth_nonces(nonce,expires_at) VALUES(?,?)")
      .bind(proof.nonce, proof.expiresAt)
      .run();
    if (!inserted.meta.changes) return null;
  } catch {
    // Fail closed: a gateway identity must never be accepted when replay
    // protection cannot be persisted.
    return null;
  }
  return proof.email;
}

/** Edge/server-rendered callers verify the proof without consuming its nonce. */
export async function trustedChatGPTEmailFromHeaders(headers: Headers, sourceRequest?: Request) {
  return (await verifyTrustedChatGPTProof(headers, sourceRequest))?.email ?? null;
}

export async function requestOwnerId(request: Request) {
  const email = await trustedChatGPTEmailFromRequest(request);
  if (email) return `email:${email}`;
  const session = await sessionUserFromRequest(request);
  if (session) return session.ownerId;
  if (
    isLocalHost(new URL(request.url).hostname) &&
    !(await hasLocalUsers())
  )
    return "local";
  throw new ApiAccessError("请先登录后再访问账本", 401);
}

export async function claimAndRequireLedger(request: Request, ledgerId: number) {
  // All ledger-scoped mutations share one CSRF boundary. API clients and
  // server-to-server integrations normally omit Origin and remain supported;
  // a browser-supplied cross-origin Origin is rejected before any ledger
  // lookup or write can occur.
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) requireSameOrigin(request);
  if (!Number.isInteger(ledgerId) || ledgerId <= 0)
    throw new ApiAccessError("账本不存在", 400);
  await ensureDb();
  const ownerId = await requestOwnerId(request);
  await claimLedgerForOwner(ownerId, ledgerId);
  return ownerId;
}

export async function claimLedgerForOwner(ownerId: string, ledgerId: number) {
  if (!ownerId) throw new ApiAccessError("接口身份未绑定账本所有者", 401);
  if (!Number.isInteger(ledgerId) || ledgerId <= 0)
    throw new ApiAccessError("账本不存在", 400);
  await ensureDb();
  const db = getDbBinding();
  // 只有真正的本地单用户兼容模式可以接管没有 owner 的历史账本。
  // 已认证用户必须通过注册时的 adoptLocal 流程显式过户；否则攻击者只要
  // 猜中一个孤立账本 ID 就能让它归属于自己的账户并读取/修改财务数据。
  if (ownerId === "local")
    await db
      .prepare("UPDATE ledgers SET owner_id=? WHERE id=? AND owner_id IS NULL")
      .bind(ownerId, ledgerId)
      .run();
  const owned = await db
    .prepare("SELECT id FROM ledgers WHERE id=? AND owner_id=?")
    .bind(ledgerId, ownerId)
    .first();
  if (!owned) throw new ApiAccessError("无权访问这个账本", 403);
}

export async function getOwnerPreferences(ownerId: string) {
  await ensureDb();
  const db = getDbBinding();
  await db
    .prepare(
      "INSERT OR IGNORE INTO user_preferences(owner_id,theme,lock_enabled) SELECT ?,theme,lock_enabled FROM app_preferences WHERE id=1",
    )
    .bind(ownerId)
    .run();
  await db
    .prepare("INSERT OR IGNORE INTO user_preferences(owner_id) VALUES(?)")
    .bind(ownerId)
    .run();
  return db
    .prepare(
      "SELECT theme,lock_enabled AS lockEnabled,pin_hash AS pinHash,pin_salt AS pinSalt,pin_iterations AS pinIterations FROM user_preferences WHERE owner_id=?",
    )
    .bind(ownerId)
    .first<{
      theme: string;
      lockEnabled: number;
      pinHash: string | null;
      pinSalt: string | null;
      pinIterations: number;
    }>();
}

export function accessErrorResponse(error: unknown, fallback: string, request?: Request) {
  const structuralStatus =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 0;
  const isDatabaseFailure =
    !(error instanceof ApiAccessError) &&
    structuralStatus !== 429 &&
    error instanceof Error &&
    /(?:SQLITE|D1|database|constraint failed|no such table|foreign key|unique constraint)/iu.test(
      error.message,
    );
  const isRuntimeFailure =
    !(error instanceof ApiAccessError) &&
    structuralStatus !== 429 &&
    structuralStatus !== 403 &&
    error instanceof Error &&
    /^(?:TypeError|ReferenceError|SyntaxError)\b|cannot read properties|is not a function|fetch failed|crypto\b|invalid state|network error|timed? ?out|ERR_[A-Z_]+/iu.test(
      error.message,
    );
  const status =
    error instanceof ApiAccessError
      ? error.status
      : structuralStatus === 429 || structuralStatus === 403
        ? structuralStatus
        : isDatabaseFailure || isRuntimeFailure
          ? 500
          : 400;
  const requestId = request ? requestIdFromRequest(request) : crypto.randomUUID();
  const headers = new Headers({
    "X-Request-ID": requestId,
    "Cache-Control": "no-store",
  });
  if (status === 429) {
    const retryAfter =
      error && typeof error === "object" && "retryAfter" in error
        ? Number((error as { retryAfter?: unknown }).retryAfter)
        : 60;
    headers.set(
      "Retry-After",
      String(Number.isFinite(retryAfter) ? Math.max(1, Math.ceil(retryAfter)) : 60),
    );
  }
  return Response.json(
    {
      error: isDatabaseFailure || isRuntimeFailure
        ? fallback
        : error instanceof Error
          ? error.message
          : fallback,
      code:
        status === 401
          ? "unauthorized"
          : status === 403
            ? "forbidden"
            : status === 429
              ? "rate_limited"
              : status === 500
                ? "internal_error"
                : "request_failed",
      requestId,
    },
    { status, headers },
  );
}

/**
 * Keep read endpoints on the same error-envelope contract as writes. In
 * particular, authorization failures must become a 403 response rather than
 * an unhandled exception that a platform may expose as a generic 500.
 */
export async function guardedApiResponse(
  request: Request,
  fallback: string,
  handler: () => Promise<Response>,
) {
  try {
    return await handler();
  } catch (error) {
    return accessErrorResponse(error, fallback, request);
  }
}
