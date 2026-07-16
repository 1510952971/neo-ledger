import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";
export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      ledgerId?: number;
      monthlyExpense?: number;
      annualReturn?: number;
    };
    const ledgerId = Number(body.ledgerId || 1),
      monthlyExpense = Math.round(Number(body.monthlyExpense) * 100),
      annualReturnBps = Math.round(Number(body.annualReturn) * 100);
    await claimAndRequireLedger(request, ledgerId);
    if (
      !monthlyExpense ||
      monthlyExpense < 10000 ||
      annualReturnBps < 0 ||
      annualReturnBps > 3000
    )
      throw new Error("请输入有效的月开销和年化收益率");
    await getDbBinding()
      .prepare(
        "INSERT INTO fire_settings(ledger_id,monthly_expense,annual_return_bps,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(ledger_id) DO UPDATE SET monthly_expense=excluded.monthly_expense,annual_return_bps=excluded.annual_return_bps,updated_at=CURRENT_TIMESTAMP",
      )
      .bind(ledgerId, monthlyExpense, annualReturnBps)
      .run();
    return NextResponse.json({ ok: true, monthlyExpense, annualReturnBps });
  } catch (error) {
    return accessErrorResponse(error, "保存失败");
  }
}
