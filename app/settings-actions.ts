import { fetchClientJson } from "./client-api.ts";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<{ response: Response; data: T | null }>;

export type SettingsActionResult = { ok: boolean; error?: string };

function result(response: Response, data: { error?: string } | null, fallback: string): SettingsActionResult {
  return response.ok
    ? { ok: true }
    : { ok: false, error: data?.error || fallback };
}

export async function saveInflationSettings(
  input: { ledgerId: number; inflationRate: number },
  request: RequestJson = fetchClientJson,
): Promise<SettingsActionResult> {
  const { response, data } = await request<{ error?: string }>("/api/economic-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return result(response, data, "通胀设置保存失败");
}

export async function saveFireSettings(
  input: { ledgerId: number; monthlyExpense: number; annualReturn: number },
  request: RequestJson = fetchClientJson,
): Promise<SettingsActionResult> {
  const { response, data } = await request<{ error?: string }>("/api/fire-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return result(response, data, "FIRE 设置保存失败");
}

export async function saveTheme(
  theme: "cream" | "obsidian" | "glacier" | "peach",
  request: RequestJson = fetchClientJson,
): Promise<SettingsActionResult> {
  const { response, data } = await request<{ error?: string }>("/api/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme }),
  });
  return result(response, data, "主题保存失败，请稍后重试");
}
