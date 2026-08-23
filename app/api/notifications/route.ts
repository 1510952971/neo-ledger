import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger, guardedApiResponse } from "../../api-security";
import { requireSameOrigin } from "../../auth";
import { readNotificationReadInput } from "../../internal-api-contract";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取通知失败", async () => {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
    await claimAndRequireLedger(request, ledgerId);
    const rows = await getDbBinding()
      .prepare(
        "SELECT id,title,message,read,created_at createdAt FROM system_notifications WHERE ledger_id=? ORDER BY id DESC LIMIT 20",
      )
      .bind(ledgerId)
      .all();
    return privateJson(rows.results);
  });
}
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureDb();
    const body = await readNotificationReadInput(request);
    const ledgerId = body.ledgerId;
    await claimAndRequireLedger(request, ledgerId);
    await getDbBinding()
      .prepare("UPDATE system_notifications SET read=1 WHERE ledger_id=?")
      .bind(ledgerId)
      .run();
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "更新通知失败", request);
  }
}
