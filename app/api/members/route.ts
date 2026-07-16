import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";

export async function GET(request: Request) {
  await ensureDb();
  const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
  await claimAndRequireLedger(request, ledgerId);
  const rows = await getDbBinding()
    .prepare(
      "SELECT id,ledger_id AS ledgerId,name,icon,is_me AS isMe,created_at AS createdAt FROM members WHERE ledger_id=? ORDER BY is_me DESC,id",
    )
    .bind(ledgerId)
    .all();
  return NextResponse.json(rows.results);
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      ledgerId?: number;
      name?: string;
      icon?: string;
    };
    const ledgerId = Number(body.ledgerId || 1);
    await claimAndRequireLedger(request, ledgerId);
    const name = String(body.name || "")
      .trim()
      .slice(0, 20);
    const icon = String(body.icon || "👤").slice(0, 4);
    if (!name) throw new Error("请输入成员名称");
    const result = await getDbBinding()
      .prepare(
        "INSERT INTO members (ledger_id,name,icon,is_me) VALUES (?,?,?,0)",
      )
      .bind(ledgerId, name, icon)
      .run();
    return NextResponse.json(
      {
        id: Number(result.meta.last_row_id),
        ledgerId,
        name,
        icon,
        isMe: false,
      },
      { status: 201 },
    );
  } catch (error) {
    return accessErrorResponse(error, "添加失败");
  }
}
