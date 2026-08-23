import { NextResponse } from "next/server";
import { createSession, sessionUserFromRequest } from "../../../../auth";
import { parseCookieValue } from "../../../../auth-core.js";
import {
  consumeOauthState,
  exchangeOauthCode,
  linkOauthIdentity,
  provisionOauthUser,
  type OAuthProvider,
} from "../../../../oauth";
import {
  normalizeOauthProvider,
  oauthStateCookie,
  oauthStateCookieName,
  safeOauthErrorMessage,
  safeReturnTo,
} from "../../../../oauth-core.js";

export const dynamic = "force-dynamic";

function secureRequest(request: Request) {
  return (
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https"
  );
}

function redirectResult(
  request: Request,
  returnTo: string,
  key: "auth_notice" | "auth_error",
  message: string,
) {
  const target = new URL(safeReturnTo(returnTo), new URL(request.url).origin);
  target.searchParams.set(key, message.slice(0, 120));
  return NextResponse.redirect(target, 303);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  let provider: OAuthProvider | null = null;
  let returnTo = "/";
  try {
    provider = normalizeOauthProvider(
      url.searchParams.get("provider"),
    ) as OAuthProvider;
    const state = url.searchParams.get("state") ?? "";
    const cookieState = parseCookieValue(
      request.headers.get("cookie"),
      oauthStateCookieName(provider),
    );
    const saved = await consumeOauthState(provider, state, cookieState);
    returnTo = saved.returnTo;
    const platformError =
      url.searchParams.get("error_description") ||
      url.searchParams.get("error") ||
      url.searchParams.get("error_code");
    if (platformError) throw new Error("第三方授权未完成，请重试");
    const code =
      url.searchParams.get("code") || url.searchParams.get("auth_code") || "";
    const profile = await exchangeOauthCode(provider, code);

    let response: NextResponse;
    if (saved.userId) {
      const session = await sessionUserFromRequest(request);
      if (!session || session.id !== saved.userId)
        throw new Error("登录会话已经变化，请重新绑定");
      await linkOauthIdentity(saved.userId, profile);
      response = redirectResult(
        request,
        returnTo,
        "auth_notice",
        `${provider === "wechat" ? "微信" : "支付宝"}绑定成功`,
      );
    } else {
      const user = await provisionOauthUser(profile);
      const session = await createSession(user.id, request);
      response = redirectResult(
        request,
        returnTo,
        "auth_notice",
        `${provider === "wechat" ? "微信" : "支付宝"}登录成功`,
      );
      response.headers.append("Set-Cookie", session.cookie);
    }
    response.headers.append(
      "Set-Cookie",
      oauthStateCookie(provider, "", {
        secure: secureRequest(request),
        maxAge: 0,
      }),
    );
    return response;
  } catch (error) {
    const message = safeOauthErrorMessage(provider, error);
    const response = redirectResult(request, returnTo, "auth_error", message);
    if (provider)
      response.headers.set(
        "Set-Cookie",
        oauthStateCookie(provider, "", {
          secure: secureRequest(request),
          maxAge: 0,
        }),
      );
    return response;
  }
}
