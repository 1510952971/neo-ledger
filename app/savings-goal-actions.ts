import { fetchClientJson } from "./client-api.ts";
import { createClientId } from "./client-id.js";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxBytes?: number,
) => Promise<{ response: Response; data: T | null }>;

export function createSavingsGoal(input: {
  ledgerId: number;
  name: unknown;
  targetAmount: number;
  deadline: unknown;
  icon: unknown;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ error?: string }>("/api/savings-goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ledgerId: input.ledgerId,
      name: input.name,
      targetAmount: input.targetAmount,
      deadline: input.deadline,
      icon: input.icon,
    }),
  });
}

export function contributeSavingsGoal(input: {
  id: number;
  accountId: number;
  amount: number;
  idempotencyKey?: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{
    appliedAmount?: number;
    completed?: boolean;
    error?: string;
  }>("/api/savings-goals", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: input.id,
      accountId: input.accountId,
      amount: input.amount,
      idempotencyKey: input.idempotencyKey ?? createClientId(),
    }),
  });
}

export function deleteSavingsGoal(input: {
  id: number;
  accountId: number;
  expectedUpdatedAt: string;
  idempotencyKey?: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ refundedAmount?: number; error?: string }>(
    "/api/savings-goals",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: input.id,
        accountId: input.accountId,
        expectedUpdatedAt: input.expectedUpdatedAt,
        idempotencyKey: input.idempotencyKey ?? createClientId(),
      }),
    },
  );
}
