import { OPENAPI_DOCUMENT } from "../../openapi";
import { requestIdFromRequest } from "../../audit-log";

export async function GET(request: Request) {
  const requestId = requestIdFromRequest(request);
  return Response.json(OPENAPI_DOCUMENT, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "X-Request-ID": requestId,
    },
  });
}
