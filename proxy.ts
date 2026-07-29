import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { SESSION_COOKIE_NAME } from "./app/auth-core.js";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function dbBinding() {
  return (env as unknown as { DB?: D1Database }).DB;
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
  return method === "GET" ? 120 : 40;
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
        .prepare("DELETE FROM api_rate_limits WHERE window_start<?")
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
         WHERE token_hash=? AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
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
  const externalTokenRoute =
    pathname.startsWith("/api/v1/webhook/") ||
    pathname.startsWith("/api/external/");
  const email = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  const trustedLocalNetwork = isLocalHost(hostname) || isPrivateNetworkHost(hostname);
  const sessionIdentity = !externalTokenRoute ? await sessionOwnerId(request) : null;
  if (!externalTokenRoute && !email && !sessionIdentity && !trustedLocalNetwork)
    return NextResponse.json({ error: "请先登录后再访问账本" }, { status: 401 });

  if (!externalTokenRoute && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const fetchSite = request.headers.get("sec-fetch-site");
    const requestOrigin = request.headers.get("origin");
    if (fetchSite === "cross-site" || (!isLocalHost(hostname) && requestOrigin !== origin))
      return NextResponse.json({ error: "已拒绝非同源请求" }, { status: 403 });
    if (requestOrigin && requestOrigin !== origin)
      return NextResponse.json({ error: "已拒绝非同源请求" }, { status: 403 });
  }

  const now = Date.now();
  const identity = email
    ? `email:${email}`
    : (sessionIdentity ?? (trustedLocalNetwork ? "local" : "external-token"));
  if (
    !externalTokenRoute &&
    !(await ownsRequestedLedger(identity, request.nextUrl.searchParams.get("ledger")))
  )
    return NextResponse.json({ error: "无权访问这个账本" }, { status: 403 });
  const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
  const key = `${identity}:${forwarded.split(",")[0]}:${request.method}:${pathname}`;
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
    return NextResponse.json(
      { error: "操作过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)) } },
    );
  if (buckets.size > 5000)
    for (const [bucketKey, value] of buckets)
      if (value.resetAt <= now) buckets.delete(bucketKey);

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(limit));
  response.headers.set("X-RateLimit-Remaining", String(Math.max(0, limit - effectiveCount)));
  return response;
}

export const config = { matcher: ["/api/:path*"] };
