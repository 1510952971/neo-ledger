import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";
import { readEconomicSettingsInput } from "../../internal-api-contract";

function privateJson(body: unknown) {
  const headers = new Headers({
    "Cache-Control": "no-store, private, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  return NextResponse.json(body, { headers });
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    const rawLedgerId = new URL(request.url).searchParams.get("ledger") ?? "1";
    const ledgerId = Number(rawLedgerId);
    if (!Number.isSafeInteger(ledgerId) || ledgerId <= 0) {
      return privateJson({ error: "账本参数无效" });
    }
    await claimAndRequireLedger(request, ledgerId);
    const row = await getDbBinding()
      .prepare(
        "SELECT ledger_id AS ledgerId,inflation_bps AS inflationBps,updated_at AS updatedAt FROM economic_settings WHERE ledger_id=?",
      )
      .bind(ledgerId)
      .first<{
        ledgerId: number;
        inflationBps: number;
        updatedAt: string;
      }>();
    return privateJson({
      ledgerId,
      inflationRate: Number(row?.inflationBps ?? 250) / 100,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (error) {
    return accessErrorResponse(error, "读取通胀参数失败", request);
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = await readEconomicSettingsInput(request),
      ledgerId = body.ledgerId,
      bps = Math.round(body.inflationRate * 100);
    await claimAndRequireLedger(request, ledgerId);
    await getDbBinding()
      .prepare(
        "INSERT INTO economic_settings(ledger_id,inflation_bps,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(ledger_id) DO UPDATE SET inflation_bps=excluded.inflation_bps,updated_at=CURRENT_TIMESTAMP",
      )
      .bind(ledgerId, bps)
      .run();
    return privateJson({ ok: true, inflationBps: bps });
  } catch (error) {
    return accessErrorResponse(error, "保存失败", request);
  }
}
