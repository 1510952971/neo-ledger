import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { claimAndRequireLedger, guardedApiResponse } from "../../../api-security";

function privateJson(body: unknown) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, private, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取账本同步状态失败", async () => {
    await ensureDb();
    const url = new URL(request.url);
    const ledgerId = Number(url.searchParams.get("ledger"));
    if (!Number.isSafeInteger(ledgerId) || ledgerId <= 0)
      throw new Error("ledger 无效");
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    const row = await getDbBinding()
      .prepare(
        "SELECT COALESCE((SELECT revision FROM ledger_sync_revisions WHERE ledger_id=?),0) AS ledgerRevision, COALESCE((SELECT revision FROM owner_sync_revisions WHERE owner_id=?),0) AS ownerRevision, COALESCE((SELECT updated_at FROM ledgers WHERE id=?),'') AS ledgerUpdatedAt",
      )
      .bind(ledgerId, ownerId, ledgerId)
      .first<{
        ledgerRevision: number;
        ownerRevision: number;
        ledgerUpdatedAt: string;
      }>();
    return privateJson({
      ledgerId,
      revision: `${Number(row?.ledgerRevision ?? 0)}:${Number(row?.ownerRevision ?? 0)}:${row?.ledgerUpdatedAt ?? ""}`,
    });
  });
}
