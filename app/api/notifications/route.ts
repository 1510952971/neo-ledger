import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";
export async function GET(request: Request) {
  await ensureDb();
  const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
  await claimAndRequireLedger(request, ledgerId);
  const rows = await getDbBinding()
    .prepare(
      "SELECT id,title,message,read,created_at createdAt FROM system_notifications WHERE ledger_id=? ORDER BY id DESC LIMIT 20",
    )
    .bind(ledgerId)
    .all();
  return NextResponse.json(rows.results);
}
export async function PATCH(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as { ledgerId?: number };
    const ledgerId = Number(body.ledgerId || 1);
    await claimAndRequireLedger(request, ledgerId);
    await getDbBinding()
      .prepare("UPDATE system_notifications SET read=1 WHERE ledger_id=?")
      .bind(ledgerId)
      .run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "更新通知失败");
  }
}
