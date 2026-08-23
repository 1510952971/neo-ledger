export const OAUTH_PROVIDERS = ["wechat", "alipay"];

const SAFE_OAUTH_ERRORS = new Set([
  "不支持的第三方登录方式",
  "第三方登录公开地址必须使用 HTTPS",
  "第三方登录状态已失效，请重试",
  "第三方登录状态已过期或已经使用",
  "登录会话已经变化，请重新绑定",
  "这个第三方账号已经绑定到其他账户",
  "当前账户已经绑定过同类账号",
  "第三方登录尚未配置",
]);

export function safeOauthErrorMessage(provider, error) {
  const raw = error instanceof Error ? error.message : "";
  if (SAFE_OAUTH_ERRORS.has(raw)) return raw;
  return `${provider === "wechat" ? "微信" : provider === "alipay" ? "支付宝" : "第三方"}登录失败，请稍后重试`;
}

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
