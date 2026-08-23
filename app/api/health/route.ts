import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { DB_SCHEMA_VERSION, ensureDb, getDbBinding } from "../../../db";
import { evaluateDeploymentSecurity } from "../../deployment-security";
import { requestIdFromRequest } from "../../audit-log";
import { APP_VERSION } from "../../app-version";

/**
 * Minimal readiness probe for a load balancer or container supervisor.
 * It intentionally exposes status and schema version only; deployment issue
 * details stay in the authenticated/configuration health endpoint.
 */
export async function GET(request: Request) {
  const requestId = requestIdFromRequest(request);
  const deployment = evaluateDeploymentSecurity(
    env as unknown as Record<string, unknown>,
    request.url,
  );
  let database: "ok" | "failed" = "failed";
  let schemaVersion: string | null = null;
  try {
    await ensureDb();
    const db = getDbBinding();
    await db.prepare("SELECT 1 AS ready").first<{ ready: number }>();
    const row = await db
      .prepare("SELECT value FROM app_meta WHERE key='schema_version'")
      .first<{ value: string }>();
    schemaVersion = row?.value ?? null;
    database = schemaVersion === DB_SCHEMA_VERSION ? "ok" : "failed";
  } catch {
    database = "failed";
  }
  const ready = deployment.secure && database === "ok";
  return NextResponse.json(
    {
      status: ready ? "ok" : "unready",
      version: APP_VERSION,
      checks: {
        database,
        schema: schemaVersion === DB_SCHEMA_VERSION ? "ok" : "failed",
        configuration: deployment.secure ? "ok" : "failed",
      },
      requestId,
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Request-ID": requestId,
      },
    },
  );
}
