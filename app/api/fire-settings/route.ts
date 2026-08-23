import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";
import { readFireSettingsInput } from "../../internal-api-contract";

function privateJson(body: unknown) {
  const headers = new Headers({
    "Cache-Control": "no-store, private, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  return NextResponse.json(body, { headers });
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = await readFireSettingsInput(request);
    const ledgerId = body.ledgerId,
      monthlyExpense = Math.round(body.monthlyExpense * 100),
      annualReturnBps = Math.round(body.annualReturn * 100);
    await claimAndRequireLedger(request, ledgerId);
    await getDbBinding()
      .prepare(
        "INSERT INTO fire_settings(ledger_id,monthly_expense,annual_return_bps,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(ledger_id) DO UPDATE SET monthly_expense=excluded.monthly_expense,annual_return_bps=excluded.annual_return_bps,updated_at=CURRENT_TIMESTAMP",
      )
      .bind(ledgerId, monthlyExpense, annualReturnBps)
      .run();
    return privateJson({ ok: true, monthlyExpense, annualReturnBps });
  } catch (error) {
    return accessErrorResponse(error, "保存失败", request);
  }
}
