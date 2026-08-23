import { fetchClientJson } from "./client-api.ts";
import { createClientId } from "./client-id.js";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<{ response: Response; data: T | null }>;

export type AssetActionResult = { ok: boolean; error?: string };

function result(response: Response, data: { error?: string } | null, fallback: string): AssetActionResult {
  return response.ok
    ? { ok: true }
    : { ok: false, error: data?.error || fallback };
}

export type SaveAssetInput = {
  id?: number;
  ledgerId: number;
  name: string;
  assetType: string;
  currency: string;
  valuationMode: "自动折旧" | "手动估值";
  manualValue: number;
  purchasePrice: number;
  purchaseDate: string;
  lifespanMonths: number;
  residualRate: number;
  heatLevel: string | null;
  expectedUpdatedAt?: string;
};

export async function saveAsset(
  input: SaveAssetInput,
  request: RequestJson = fetchClientJson,
): Promise<AssetActionResult> {
  const { response, data } = await request<{ error?: string }>("/api/assets", {
    method: input.id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return result(response, data, input.id ? "修改失败" : "新增失败");
}

export async function liquidateAsset(
  input: { id: number; ledgerId: number; salePrice: number; accountId: number; expectedUpdatedAt: string; idempotencyKey?: string },
  request: RequestJson = fetchClientJson,
): Promise<AssetActionResult> {
  const { response, data } = await request<{ error?: string }>("/api/assets", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, idempotencyKey: input.idempotencyKey ?? createClientId() }),
  });
  return result(response, data, "变现失败");
}
