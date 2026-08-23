import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { APP_VERSION } from "../../../app-version";
import { evaluateDeploymentSecurity, hostAllowlist } from "../../../deployment-security";
import { requestIdFromRequest } from "../../../audit-log";

export async function GET(request: Request) {
  const requestId = requestIdFromRequest(request);
  const runtime = env as unknown as Record<string, unknown>;
  const deployment = evaluateDeploymentSecurity(runtime, request.url);
  const deploymentMode = deployment.mode ?? String(runtime.DEPLOYMENT_MODE || "local");
  const hstsEnabled = /^(1|true|yes)$/i.test(String(runtime.NEO_HSTS || ""));
  const trustedHeaders = /^(1|true|yes)$/i.test(String(runtime.NEO_TRUSTED_AUTH_HEADERS || ""));
  const trustedProxyReady =
    !trustedHeaders ||
    (String(runtime.NEO_TRUSTED_AUTH_SECRET || "").length >= 32 &&
      String(runtime.NEO_TRUSTED_PROXY_IPS || "").trim().length > 0);
  const webdavHosts = hostAllowlist(runtime, "NEO_WEBDAV_ALLOWED_HOSTS");
  const allowedHosts = hostAllowlist(runtime);
  const secureConfiguration = deployment.secure;
  return NextResponse.json(
    {
      ok: secureConfiguration,
      version: APP_VERSION,
      deploymentMode,
      secureConfiguration,
      hstsEnabled,
      trustedProxyReady,
      webdavAllowlistConfigured: webdavHosts.length > 0,
      hostAllowlistConfigured: allowedHosts.length > 0,
      configurationIssues: deployment.blocking.map((issue) => issue.code),
      configurationWarnings: deployment.warnings.map((issue) => issue.code),
    },
    {
      status: secureConfiguration ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Request-ID": requestId,
      },
    },
  );
}
