import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAlipayAuthorizeUrl,
  buildWechatAuthorizeUrl,
  normalizeOauthProvider,
  oauthStateCookie,
  safeOauthErrorMessage,
  safeReturnTo,
} from "../app/oauth-core.js";

test("builds official WeChat and Alipay authorization URLs", () => {
  const callback = "https://ledger.example/api/auth/oauth/callback?provider=wechat";
  const wechat = buildWechatAuthorizeUrl({
    appId: "wx-test",
    redirectUri: callback,
    state: "secure-state",
  });
  assert.match(wechat, /^https:\/\/open\.weixin\.qq\.com\/connect\/qrconnect\?/);
  assert.match(wechat, /appid=wx-test/);
  assert.match(wechat, /scope=snsapi_login/);
  assert.match(wechat, /state=secure-state/);
  assert.match(wechat, /#wechat_redirect$/);

  const alipay = new URL(
    buildAlipayAuthorizeUrl({
      appId: "ali-test",
      redirectUri: callback.replace("wechat", "alipay"),
      state: "secure-state",
    }),
  );
  assert.equal(alipay.origin, "https://openauth.alipay.com");
  assert.equal(alipay.searchParams.get("app_id"), "ali-test");
  assert.equal(alipay.searchParams.get("scope"), "auth_user");
});

test("OAuth state is provider-scoped, short-lived and resists open redirects", () => {
  assert.equal(normalizeOauthProvider("WeChat"), "wechat");
  assert.throws(() => normalizeOauthProvider("unknown"), /不支持/);
  assert.equal(safeReturnTo("/settings?tab=account"), "/settings?tab=account");
  assert.equal(safeReturnTo("https://attacker.example"), "/");
  assert.equal(safeReturnTo("//attacker.example"), "/");
  const cookie = oauthStateCookie("alipay", "secret", { secure: true });
  assert.match(cookie, /^neo_ledger_oauth_alipay=secret/);
  assert.match(cookie, /Path=\/api\/auth\/oauth/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=600/);
  assert.match(cookie, /Secure/);
});

test("OAuth callback never reflects provider or runtime error text", () => {
  assert.equal(safeOauthErrorMessage("wechat", new Error("provider leaked secret")), "微信登录失败，请稍后重试");
  assert.equal(safeOauthErrorMessage("alipay", new Error("第三方登录状态已失效，请重试")), "第三方登录状态已失效，请重试");
});
