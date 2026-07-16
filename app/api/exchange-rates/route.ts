import { NextResponse } from "next/server";
import { FX_TO_CNY } from "../../../db";
export async function GET() {
  return NextResponse.json({
    base: "CNY",
    rates: FX_TO_CNY,
    source: "NeoLedger daily simulation",
    updatedAt: new Date().toISOString().slice(0, 10),
  });
}
