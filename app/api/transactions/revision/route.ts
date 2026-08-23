import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { claimAndRequireLedger, guardedApiResponse } from "../../../api-security";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取账本同步状态失败", async () => {
    await ensureDb();
    const url = new URL(request.url);
    const ledgerId = Number(url.searchParams.get("ledger"));
    if (!Number.isSafeInteger(ledgerId) || ledgerId <= 0) throw new Error("ledger 无效");
    await claimAndRequireLedger(request, ledgerId);
    const row = await getDbBinding()
      .prepare("SELECT revision,updated_at updatedAt FROM ledger_revisions WHERE ledger_id=?")
      .bind(ledgerId)
      .first<{ revision: number; updatedAt: string }>();
    return privateJson({
      ledgerId,
      revision: String(Number(row?.revision ?? 0)),
      updatedAt: row?.updatedAt ?? "",
    });
  });
}
