import { env } from "cloudflare:workers";
import { ensureDb, getDbBinding } from "../db";
import {
  adoptOrProvisionVault,
  authTokenDigest,
  passwordRecord,
} from "./auth";
import {
  buildAlipayAuthorizeUrl,
  buildWechatAuthorizeUrl,
  normalizeOauthProvider,
  oauthStateCookie,
  safeReturnTo,
} from "./oauth-core.js";

export type OAuthProvider = "wechat" | "alipay";

export type OAuthProfile = {
  provider: OAuthProvider;
  subject: string;
  displayName: string;
  avatarUrl: string | null;
};

type OAuthState = {
  provider: OAuthProvider;
  userId: string | null;
  returnTo: string;
};

const runtimeEnv = env as unknown as Record<string, string | undefined>;

function configValue(name: string) {
  return String(runtimeEnv[name] ?? "").trim();
}

function secureRequest(request: Request) {
  return (
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https"
  );
}

function publicOrigin(request: Request) {
  const configured = configValue("AUTH_PUBLIC_ORIGIN").replace(/\/$/, "");
  if (!configured) return new URL(request.url).origin;
  const parsed = new URL(configured);
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))
  )
    throw new Error("第三方登录公开地址必须使用 HTTPS");
  return parsed.origin;
}

export function oauthProviderStatus() {
  return {
    wechat: Boolean(
      configValue("WECHAT_APP_ID") && configValue("WECHAT_APP_SECRET"),
    ),
    alipay: Boolean(
      configValue("ALIPAY_APP_ID") &&
        configValue("ALIPAY_PRIVATE_KEY") &&
        configValue("ALIPAY_PUBLIC_KEY"),
    ),
  };
}

export function oauthCallbackUrl(request: Request, provider: OAuthProvider) {
  return `${publicOrigin(request)}/api/auth/oauth/callback?provider=${provider}`;
}

export async function createOauthAuthorization(
  request: Request,
  providerInput: string,
  userId: string | null,
  returnToInput: string | null,
) {
  await ensureDb();
  const provider = normalizeOauthProvider(providerInput) as OAuthProvider;
  if (!oauthProviderStatus()[provider])
    throw new Error(`${provider === "wechat" ? "微信" : "支付宝"}登录尚未配置`);
  const state = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const stateHash = await authTokenDigest(state);
  const returnTo = safeReturnTo(returnToInput);
  const db = getDbBinding();
  await db.batch([
    db.prepare(
      "DELETE FROM oauth_states WHERE expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    ),
    db.prepare(
      "INSERT INTO oauth_states(state_hash,provider,user_id,return_to,expires_at) VALUES(?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now','+10 minutes'))",
    ).bind(stateHash, provider, userId, returnTo),
  ]);
  const redirectUri = oauthCallbackUrl(request, provider);
  const authorizeUrl =
    provider === "wechat"
      ? buildWechatAuthorizeUrl({
          appId: configValue("WECHAT_APP_ID"),
          redirectUri,
          state,
        })
      : buildAlipayAuthorizeUrl({
          appId: configValue("ALIPAY_APP_ID"),
          redirectUri,
          state,
        });
  return {
    provider,
    authorizeUrl,
    cookie: oauthStateCookie(provider, state, {
      secure: secureRequest(request),
    }),
  };
}

export async function consumeOauthState(
  providerInput: string,
  state: string,
  cookieState: string,
): Promise<OAuthState> {
  const provider = normalizeOauthProvider(providerInput) as OAuthProvider;
  if (!state || state !== cookieState) throw new Error("第三方登录状态已失效，请重试");
  await ensureDb();
  const stateHash = await authTokenDigest(state);
  const row = await getDbBinding()
    .prepare(
      `UPDATE oauth_states SET expires_at='1970-01-01T00:00:00.000Z'
       WHERE state_hash=? AND provider=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
       RETURNING provider,user_id userId,return_to returnTo`,
    )
    .bind(stateHash, provider)
    .first<OAuthState>();
  if (!row) throw new Error("第三方登录状态已过期或已经使用");
  return row;
}

function decodeBase64(value: string) {
  const binary = atob(value.replaceAll(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}

function pemBytes(value: string) {
  const normalized = value.replaceAll("\\n", "\n");
  const body = normalized
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replaceAll(/\s/g, "");
  return decodeBase64(body);
}

function alipayTimestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

function canonicalAlipayParams(params: Record<string, string>) {
  return Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

async function signAlipay(params: Record<string, string>) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(configValue("ALIPAY_PRIVATE_KEY")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(canonicalAlipayParams(params)),
  );
  return encodeBase64(new Uint8Array(signature));
}

function rawJsonProperty(raw: string, property: string) {
  const marker = `"${property}"`;
  const markerIndex = raw.indexOf(marker);
  if (markerIndex < 0) throw new Error("支付宝响应格式无效");
  const start = raw.indexOf("{", markerIndex + marker.length);
  if (start < 0) throw new Error("支付宝响应格式无效");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return raw.slice(start, index + 1);
  }
  throw new Error("支付宝响应格式无效");
}

async function verifyAlipayResponse(raw: string, responseKey: string) {
  const parsed = JSON.parse(raw) as { sign?: string };
  if (!parsed.sign) throw new Error("支付宝响应缺少签名");
  const key = await crypto.subtle.importKey(
    "spki",
    pemBytes(configValue("ALIPAY_PUBLIC_KEY")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64(parsed.sign),
    new TextEncoder().encode(rawJsonProperty(raw, responseKey)),
  );
  if (!valid) throw new Error("支付宝响应签名校验失败");
  return parsed as Record<string, unknown>;
}

async function alipayCall(
  method: string,
  responseKey: string,
  extra: Record<string, string>,
) {
  const params: Record<string, string> = {
    app_id: configValue("ALIPAY_APP_ID"),
    method,
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: alipayTimestamp(),
    version: "1.0",
    ...extra,
  };
  const form = new URLSearchParams({ ...params, sign: await signAlipay(params) });
  const response = await fetch("https://openapi.alipay.com/gateway.do", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: form,
  });
  const raw = await response.text();
  if (!response.ok) throw new Error("支付宝登录服务暂时不可用");
  const parsed = await verifyAlipayResponse(raw, responseKey);
  const value = parsed[responseKey] as Record<string, unknown> | undefined;
  if (!value || (value.code && value.code !== "10000"))
    throw new Error(String(value?.sub_msg || value?.msg || "支付宝授权失败"));
  return value;
}

async function exchangeWechat(code: string): Promise<OAuthProfile> {
  const tokenUrl = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  tokenUrl.search = new URLSearchParams({
    appid: configValue("WECHAT_APP_ID"),
    secret: configValue("WECHAT_APP_SECRET"),
    code,
    grant_type: "authorization_code",
  }).toString();
  const token = (await (await fetch(tokenUrl)).json()) as Record<string, unknown>;
  if (!token.access_token || !token.openid)
    throw new Error(String(token.errmsg || "微信授权失败"));
  const profileUrl = new URL("https://api.weixin.qq.com/sns/userinfo");
  profileUrl.search = new URLSearchParams({
    access_token: String(token.access_token),
    openid: String(token.openid),
    lang: "zh_CN",
  }).toString();
  const profile = (await (await fetch(profileUrl)).json()) as Record<string, unknown>;
  if (profile.errcode) throw new Error(String(profile.errmsg || "读取微信资料失败"));
  const unionId = String(profile.unionid || token.unionid || "");
  return {
    provider: "wechat",
    subject: unionId ? `unionid:${unionId}` : `openid:${String(token.openid)}`,
    displayName: String(profile.nickname || "微信用户").slice(0, 30),
    avatarUrl: profile.headimgurl ? String(profile.headimgurl) : null,
  };
}

async function exchangeAlipay(code: string): Promise<OAuthProfile> {
  const token = await alipayCall(
    "alipay.system.oauth.token",
    "alipay_system_oauth_token_response",
    { grant_type: "authorization_code", code },
  );
  const accessToken = String(token.access_token || "");
  const subject = String(token.user_id || token.open_id || "");
  if (!accessToken || !subject) throw new Error("支付宝没有返回有效用户信息");
  const profile = await alipayCall(
    "alipay.user.info.share",
    "alipay_user_info_share_response",
    { auth_token: accessToken },
  );
  return {
    provider: "alipay",
    subject,
    displayName: String(profile.nick_name || "支付宝用户").slice(0, 30),
    avatarUrl: profile.avatar ? String(profile.avatar) : null,
  };
}

export async function exchangeOauthCode(
  provider: OAuthProvider,
  code: string,
) {
  if (!code) throw new Error("第三方平台没有返回授权码");
  return provider === "wechat" ? exchangeWechat(code) : exchangeAlipay(code);
}

export async function provisionOauthUser(profile: OAuthProfile) {
  const db = getDbBinding();
  const existing = await db
    .prepare(
      `SELECT u.id,u.username,u.display_name displayName,u.email
       FROM app_identities i JOIN app_users u ON u.id=i.user_id
       WHERE i.provider=? AND i.subject=? AND u.disabled=0`,
    )
    .bind(profile.provider, profile.subject)
    .first<{ id: string; username: string; displayName: string; email: string | null }>();
  if (existing) return { ...existing, created: false };

  const firstAccount = !(await db
    .prepare("SELECT 1 found FROM app_users WHERE disabled=0 LIMIT 1")
    .first());
  const id = crypto.randomUUID();
  const suffix = (await authTokenDigest(`${profile.provider}:${profile.subject}`)).slice(0, 12);
  const username = `${profile.provider}.${suffix}.${crypto.randomUUID().slice(0, 4)}`;
  const password = await passwordRecord(crypto.randomUUID() + crypto.randomUUID());
  await db.batch([
    db.prepare(
      `INSERT INTO app_users(id,username,display_name,password_hash,password_salt,password_iterations,password_enabled)
       VALUES(?,?,?,?,?,?,0)`,
    ).bind(id, username, profile.displayName, password.hash, password.salt, password.iterations),
    db.prepare(
      `INSERT INTO app_identities(provider,subject,user_id,display_name,avatar_url)
       VALUES(?,?,?,?,?)`,
    ).bind(profile.provider, profile.subject, id, profile.displayName, profile.avatarUrl),
  ]);
  await adoptOrProvisionVault(id, profile.displayName, firstAccount);
  return { id, username, displayName: profile.displayName, email: null, created: true, firstAccount };
}

export async function linkOauthIdentity(userId: string, profile: OAuthProfile) {
  const db = getDbBinding();
  const claimed = await db
    .prepare("SELECT user_id userId FROM app_identities WHERE provider=? AND subject=?")
    .bind(profile.provider, profile.subject)
    .first<{ userId: string }>();
  if (claimed && claimed.userId !== userId)
    throw new Error("这个第三方账号已经绑定到其他财富仓");
  const other = await db
    .prepare("SELECT subject FROM app_identities WHERE provider=? AND user_id=?")
    .bind(profile.provider, userId)
    .first();
  if (other && !claimed) throw new Error("当前财富仓已经绑定过同类账号");
  await db.prepare(
    `INSERT INTO app_identities(provider,subject,user_id,display_name,avatar_url,updated_at)
     VALUES(?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(provider,subject) DO UPDATE SET display_name=excluded.display_name,avatar_url=excluded.avatar_url,updated_at=excluded.updated_at`,
  ).bind(profile.provider, profile.subject, userId, profile.displayName, profile.avatarUrl).run();
}
