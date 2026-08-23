import { fetchClientJson } from "./client-api.ts";
import { createClientId } from "./client-id.js";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<{ response: Response; data: T | null }>;

export type PlanningActionResult = { ok: boolean; error?: string };

function result(response: Response, data: { error?: string } | null, fallback: string): PlanningActionResult {
  return response.ok
    ? { ok: true }
    : { ok: false, error: data?.error || fallback };
}

export async function processPendingTransaction(
  input: { id: number; category?: string; action: "confirm" | "ignore" },
  request: RequestJson = fetchClientJson,
): Promise<PlanningActionResult> {
  const { response, data } = await request<{ error?: string }>("/api/pending-transactions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return result(response, data, "待确认流水处理失败，请稍后重试");
}

export async function saveCategoryBudget(
  input: { ledgerId: number; category: string; amount: number },
  request: RequestJson = fetchClientJson,
): Promise<PlanningActionResult> {
  const { response, data } = await request<{ error?: string }>("/api/category-budgets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return result(response, data, "预算保存失败，请稍后重试");
}

export async function settleMember(
  input: { ledgerId: number; memberId: number; amount: number; direction: "owesMe" | "iOwe"; idempotencyKey?: string },
  request: RequestJson = fetchClientJson,
): Promise<PlanningActionResult> {
  const { response, data } = await request<{ error?: string }>("/api/settlements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, idempotencyKey: input.idempotencyKey ?? createClientId() }),
  });
  return result(response, data, "平账失败，请稍后重试");
}
