import { fetchClientJson } from "./client-api.ts";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxBytes?: number,
) => Promise<{ response: Response; data: T | null }>;

export type PendingFlow = {
  id: number;
  rawText: string;
  title: string;
  amount: number;
  type: "支出" | "收入";
  accountId: number;
  accountName: string;
  currency: "CNY" | "USD" | "JPY" | "EUR";
  occurredAt: string;
  status: string;
  createdAt: string;
  automationSuggestion: null | {
    ruleId: string;
    ruleName: string;
    actions: {
      category?: string;
      incomeCategory?: string;
      mood?: string;
      accountId?: number;
    };
    reasons: string[];
  };
};

export type SystemNotice = {
  id: number;
  title: string;
  message: string;
  read: number | boolean;
  createdAt: string;
};

export function notificationUrls(ledgerId: number) {
  return {
    pending: `/api/pending-transactions?ledger=${ledgerId}&limit=100`,
    notices: `/api/notifications?ledger=${ledgerId}`,
  };
}

export function loadNotificationData(input: {
  ledgerId: number;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  const urls = notificationUrls(input.ledgerId);
  return Promise.all([
    request<PendingFlow[]>(urls.pending, { cache: "no-store" }),
    request<SystemNotice[]>(urls.notices, { cache: "no-store" }),
  ]).then(([pending, notice]) => ({ pending, notice }));
}

export function markNotificationsRead(input: {
  ledgerId: number;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ error?: string }>("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ledgerId: input.ledgerId }),
  });
}
