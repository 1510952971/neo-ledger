import { fetchClientJson } from "./client-api.ts";
import { createClientId } from "./client-id.js";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxBytes?: number,
) => Promise<{ response: Response; data: T | null }>;

type SubscriptionInput = {
  id?: number;
  ledgerId: number;
  name: unknown;
  amount: number;
  accountId: number;
  cycle: unknown;
  category: string;
  nextChargeDate: unknown;
};

export function saveSubscription(input: SubscriptionInput & { request?: RequestJson }) {
  const request = input.request ?? fetchClientJson;
  return request<{ error?: string }>("/api/subscriptions", {
    method: input.id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: input.id,
      ledgerId: input.ledgerId,
      name: input.name,
      amount: input.amount,
      accountId: input.accountId,
      cycle: input.cycle,
      category: input.category,
      nextChargeDate: input.nextChargeDate,
    }),
  });
}

export function removeSubscription(input: {
  id: number;
  ledgerId: number;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ error?: string }>(
    `/api/subscriptions?id=${input.id}&ledger=${input.ledgerId}`,
    { method: "DELETE" },
  );
}

export function createInstallment(input: {
  ledgerId: number;
  name: unknown;
  totalAmount: number;
  periods: number;
  feeAmount: number;
  accountId: number;
  paymentAccountId: number;
  startMonth: unknown;
  chargeDay: number;
  idempotencyKey?: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ error?: string }>("/api/installments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ledgerId: input.ledgerId,
      name: input.name,
      totalAmount: input.totalAmount,
      periods: input.periods,
      feeAmount: input.feeAmount,
      accountId: input.accountId,
      paymentAccountId: input.paymentAccountId,
      startMonth: input.startMonth,
      chargeDay: input.chargeDay,
      idempotencyKey: input.idempotencyKey ?? createClientId(),
    }),
  });
}

export function removeInstallment(input: {
  id: number;
  expectedUpdatedAt: string;
  idempotencyKey?: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  const key = input.idempotencyKey ?? createClientId();
  return request<{ ok?: boolean; duplicate?: boolean; error?: string }>(
    `/api/installments?id=${encodeURIComponent(String(input.id))}&expectedUpdatedAt=${encodeURIComponent(input.expectedUpdatedAt)}&idempotencyKey=${encodeURIComponent(key)}`,
    { method: "DELETE" },
  );
}
