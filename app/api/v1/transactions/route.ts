import { handleQuickSync } from "../../external/quick-sync/route";

export async function POST(request: Request) {
  return handleQuickSync(request, { strict: true });
}
