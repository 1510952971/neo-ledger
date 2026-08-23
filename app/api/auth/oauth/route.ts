import { NextResponse } from "next/server";
import { accessErrorResponse } from "../../../api-security";
import { sessionUserFromRequest } from "../../../auth";
import { createOauthAuthorization } from "../../../oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const user = await sessionUserFromRequest(request);
    const authorization = await createOauthAuthorization(
      request,
      url.searchParams.get("provider") ?? "",
      user?.id ?? null,
      url.searchParams.get("return_to"),
    );
    const response = NextResponse.redirect(authorization.authorizeUrl, 303);
    response.headers.set("Set-Cookie", authorization.cookie);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return accessErrorResponse(error, "第三方登录启动失败", request);
  }
}
