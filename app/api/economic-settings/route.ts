import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";
export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
        ledgerId?: number;
        inflationRate?: number;
      },
      ledgerId = Number(body.ledgerId || 1),
      bps = Math.round(Number(body.inflationRate) * 100);
    await claimAndRequireLedger(request, ledgerId);
    if (bps < 0 || bps > 5000) throw new Error("通胀率应在 0%—50% 之间");
    await getDbBinding()
      .prepare(
        "INSERT INTO economic_settings(ledger_id,inflation_bps,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(ledger_id) DO UPDATE SET inflation_bps=excluded.inflation_bps,updated_at=CURRENT_TIMESTAMP",
      )
      .bind(ledgerId, bps)
      .run();
    return NextResponse.json({ ok: true, inflationBps: bps });
  } catch (error) {
    return accessErrorResponse(error, "保存失败");
  }
}
