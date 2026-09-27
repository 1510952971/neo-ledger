import { ensureDb, evaluateAchievements } from "../../../db";
import { claimAndRequireLedger, guardedApiResponse } from "../../api-security";

function privateJson(body: unknown) {
  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store, private, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取成就失败", async () => {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
    await claimAndRequireLedger(request, ledgerId);
    const result = await evaluateAchievements(ledgerId);
    return privateJson(result.results);
  });
}
