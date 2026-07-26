export const OAUTH_PROVIDERS = ["wechat", "alipay"];

export function normalizeOauthProvider(value) {
  const provider = String(value ?? "").trim().toLowerCase();
  if (!OAUTH_PROVIDERS.includes(provider))
    throw new Error("不支持的第三方登录方式");
  return provider;
}

export function safeReturnTo(value) {
  const path = String(value ?? "/").trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

export function oauthStateCookieName(provider) {
  return `neo_ledger_oauth_${normalizeOauthProvider(provider)}`;
}

export function oauthStateCookie(
  provider,
  state,
  { secure = false, maxAge = 600 } = {},
) {
  const parts = [
    `${oauthStateCookieName(provider)}=${encodeURIComponent(state)}`,
    "Path=/api/auth/oauth",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildWechatAuthorizeUrl({ appId, redirectUri, state }) {
  const params = new URLSearchParams({
    appid: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "snsapi_login",
    state,
  });
  return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`;
}

export function buildAlipayAuthorizeUrl({ appId, redirectUri, state }) {
  const params = new URLSearchParams({
    app_id: appId,
    scope: "auth_user",
    redirect_uri: redirectUri,
    state,
  });
  return `https://openauth.alipay.com/oauth2/publicAppAuthorize.htm?${params.toString()}`;
}
