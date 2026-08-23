import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { SESSION_COOKIE_NAME } from "./app/auth-core.js";
import { validRequestId } from "./app/audit-log";
import { trustedChatGPTEmailFromHeaders } from "./app/api-security";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function dbBinding() {
  return (env as unknown as { DB?: D1Database }).DB;
}

function configValue(name: string) {
  const runtime = env as unknown as Record<string, unknown>;
  return String(
    runtime[name] ??
      (globalThis as unknown as { process?: { env?: Record<string, string> } })
        .process?.env?.[name] ??
      "",
  ).trim();
}

function trustedIdentityProxyEnabled() {
  const value = configValue("NEO_TRUSTED_AUTH_HEADERS").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}


function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isPrivateNetworkHost(hostname: string) {
  const octets = hostname.split(".").map((value) => Number(value));
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255))
    return false;
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function limitFor(pathname: string, method: string) {
  if (pathname === "/api/data/restore") return 3;
  if (pathname === "/api/bill-import") return method === "POST" ? 10 : 5;
  if (pathname === "/api/webdav-sync") return 10;
  if (
    method === "POST" &&
    (pathname === "/api/external/quick-sync" ||
      pathname === "/api/v1/transactions" ||
      pathname.startsWith("/api/v1/webhook/"))
  )
    return 60;
  return method === "GET" ? 120 : 40;
}

function bodyLimitFor(pathname: string, method: string) {
  if (method !== "POST" && method !== "PUT" && method !== "PATCH") return null;
  if (pathname === "/api/data/restore") return 50 * 1024 * 1024;
  if (pathname === "/api/bill-import") return 15 * 1024 * 1024;
  if (
    pathname === "/api/external/quick-sync" ||
    pathname === "/api/v1/transactions" ||
    pathname.startsWith("/api/v1/webhook/")
  )
    return 64 * 1024;
  return null;
}

async function globalRequestCount(identity: string, scope: string, windowStart: number) {
  try {
    const binding = dbBinding();
    if (!binding) return null;
    await binding
      .prepare(
        "INSERT INTO api_rate_limits(owner_id,scope,window_start,count) VALUES(?,?,?,1) ON CONFLICT(owner_id,scope,window_start) DO UPDATE SET count=count+1",
      )
      .bind(identity, scope, windowStart)
      .run();
    const row = await binding
      .prepare(
        "SELECT count FROM api_rate_limits WHERE owner_id=? AND scope=? AND window_start=?",
      )
      .bind(identity, scope, windowStart)
      .first<{ count: number }>();
    if (Math.random() < 0.01)
      await binding
        .prepare("DELETE FROM api_rate_limits WHERE scope NOT LIKE 'auth:%' AND scope <> 'quick-sync' AND window_start<?")
        .bind(windowStart - 3_600_000)
        .run();
    return Number(row?.count ?? 1);
  } catch {
    return null;
  }
}

// 登录后账本归属会从 "local" 变成 "user:<id>"，因此这里必须按会话解析身份，
// 不能只看请求头和 hostname，否则本机登录用户会被自己的账本挡在门外。
async function sessionOwnerId(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const binding = dbBinding();
    if (!binding) return null;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    const tokenHash = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const row = await binding
      .prepare(
       `SELECT user_id AS userId FROM app_sessions
        WHERE token_hash=? AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
           AND last_used_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-14 days')
           AND NOT EXISTS (
             SELECT 1 FROM app_session_devices d
             WHERE d.token_hash=app_sessions.token_hash
               AND (d.revoked_at IS NOT NULL OR d.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
           )`,
      )
      .bind(tokenHash)
      .first<{ userId: string }>();
    return row ? `user:${row.userId}` : null;
  } catch {
    return null;
  }
}

async function ownsRequestedLedger(identity: string, ledgerValue: string | null) {
  if (!ledgerValue) return true;
  const ledgerId = Number(ledgerValue);
  if (!Number.isInteger(ledgerId) || ledgerId <= 0) return false;
  try {
    const binding = dbBinding();
    if (!binding) return true;
    const row = await binding
      .prepare("SELECT owner_id AS ownerId FROM ledgers WHERE id=?")
      .bind(ledgerId)
      .first<{ ownerId: string | null }>();
    return !row || row.ownerId === null || row.ownerId === identity;
  } catch {
    return true;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, origin, hostname } = request.nextUrl;
  const requestId = validRequestId(request.headers.get("x-request-id")) ?? crypto.randomUUID();
  const responseHeaders = { "X-Request-ID": requestId, "Cache-Control": "no-store" };
  const errorResponse = (error: string, status: number, code: string, headers?: HeadersInit) =>
    NextResponse.json(
      { error, code, requestId },
      { status, headers: { ...responseHeaders, ...Object.fromEntries(new Headers(headers)) } },
    );
  const externalTokenRoute =
    pathname === "/api/openapi.json" ||
    pathname === "/api/health" ||
    pathname.startsWith("/api/v1/webhook/") ||
    pathname === "/api/v1/transactions" ||
    pathname.startsWith("/api/external/");
  // Discoverable Passkey authentication starts without a session. The route
  // still enforces same-origin, rate limits and challenge binding below; it
  // only needs to pass the edge's pre-session gate so remote users can begin
  // WebAuthn login.
  const publicPasskeyRoute = pathname === "/api/auth/passkeys";
  const email = trustedIdentityProxyEnabled()
    ? await trustedChatGPTEmailFromHeaders(request.headers, request)
    : null;
  const trustedLocalNetwork = isLocalHost(hostname) || isPrivateNetworkHost(hostname);
  const sessionIdentity = !externalTokenRoute ? await sessionOwnerId(request) : null;
  if (!externalTokenRoute && !publicPasskeyRoute && !email && !sessionIdentity && !trustedLocalNetwork)
    return errorResponse("请先登录后再访问账本", 401, "unauthorized");

  if (!externalTokenRoute && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const fetchSite = request.headers.get("sec-fetch-site");
    const requestOrigin = request.headers.get("origin");
    if (fetchSite === "cross-site" || (!isLocalHost(hostname) && requestOrigin !== origin))
      return errorResponse("已拒绝非同源请求", 403, "forbidden");
    if (requestOrigin && requestOrigin !== origin)
      return errorResponse("已拒绝非同源请求", 403, "forbidden");
  }

  const bodyLimit = bodyLimitFor(pathname, request.method);
  const contentLength = request.headers.get("content-length");
  if (bodyLimit && contentLength) {
    const declared = Number(contentLength);
    if (!Number.isFinite(declared) || declared < 0)
      return errorResponse("请求大小声明无效", 400, "request_failed");
    if (declared > bodyLimit)
      return errorResponse(
        "请求不能超过 " + Math.floor(bodyLimit / 1024 / 1024) + " MB",
        413,
        "payload_too_large",
      );
  }

  const now = Date.now();
  const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
  const sourceAddress = forwarded.split(",")[0].trim().slice(0, 80) || "unknown";
  const identity = email
    ? `email:${email}`
    : (sessionIdentity ??
      (externalTokenRoute ? `external:${sourceAddress}` : trustedLocalNetwork ? "local" : "anonymous"));
  if (
    !externalTokenRoute &&
    !(await ownsRequestedLedger(identity, request.nextUrl.searchParams.get("ledger")))
  )
    return errorResponse("无权访问这个账本", 403, "forbidden");
  const key = `${identity}:${sourceAddress}:${request.method}:${pathname}`;
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + 60_000 }
    : { count: current.count + 1, resetAt: current.resetAt };
  buckets.set(key, bucket);
  const limit = limitFor(pathname, request.method);
  const windowStart = Math.floor(now / 60_000) * 60_000;
  const globalCount = await globalRequestCount(
    identity,
    `${request.method}:${pathname}`,
    windowStart,
  );
  const effectiveCount = globalCount ?? bucket.count;
  if (effectiveCount > limit)
    return errorResponse(
      "操作过于频繁，请稍后再试",
      429,
      "rate_limited",
      { "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)) },
    );
  if (buckets.size > 5000)
    for (const [bucketKey, value] of buckets)
      if (value.resetAt <= now) buckets.delete(bucketKey);

  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  if (/^(1|true|yes)$/i.test(configValue("NEO_HSTS")))
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  response.headers.set("X-RateLimit-Limit", String(limit));
  response.headers.set("X-RateLimit-Remaining", String(Math.max(0, limit - effectiveCount)));
  response.headers.set("X-Request-ID", requestId);
  response.headers.set(
    "Cache-Control",
    pathname === "/api/openapi.json" ? "public, max-age=300" : "no-store",
  );
  return response;
}

export const config = { matcher: ["/api/:path*"] };
