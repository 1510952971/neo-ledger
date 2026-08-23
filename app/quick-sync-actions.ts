import { fetchClientJson } from "./client-api.ts";
import type { QuickSyncStatus } from "./quick-sync-state";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxBytes?: number,
) => Promise<{ response: Response; data: T | null }>;

type QuickSyncTokenResponse = QuickSyncStatus & {
  token?: string;
  error?: string;
};

type QuickSyncErrorResponse = { error?: string };

export function loadQuickSyncStatus(request: RequestJson = fetchClientJson) {
  return request<QuickSyncStatus>("/api/integrations/quick-sync", {
    cache: "no-store",
  });
}

export function createQuickSyncToken(input: {
  label: string;
  expiresInDays: number;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<QuickSyncTokenResponse>("/api/integrations/quick-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: input.label,
      expiresInDays: input.expiresInDays,
      scope: "ledger:write",
    }),
  });
}

export function revokeQuickSyncToken(request: RequestJson = fetchClientJson) {
  return request<QuickSyncErrorResponse>("/api/integrations/quick-sync", {
    method: "DELETE",
  });
}

export function buildQuickSyncExample(input: {
  origin: string;
  token: string;
  ledgerId: number;
  now?: Date;
}) {
  const endpoint = `${input.origin.replace(/\/+$/, "")}/api/v1/transactions`;
  const timestamp = (input.now ?? new Date()).toISOString();
  return `curl -X POST '${endpoint}' -H 'Authorization: Bearer ${input.token}' -H 'Content-Type: application/json' -H 'Idempotency-Key: demo-001' -d '{"amount":35.5,"merchant":"午餐","ledgerId":${input.ledgerId},"category":"餐饮","source":"shortcut","time":"${timestamp}"}'`;
}

export function buildAndroidCompanionConfig(input: {
  origin: string;
  token: string;
  ledgerId: number;
}) {
  return JSON.stringify({
    type: "neo-ledger-android-config-v1",
    url: input.origin.replace(/\/+$/, ""),
    token: input.token,
    ledgerId: input.ledgerId,
  });
}

export function buildQuickSyncTemplate(input: {
  kind: "shortcut" | "notification";
  origin: string;
  token: string;
  ledgerId: number;
}) {
  const isShortcut = input.kind === "shortcut";
  const template = {
    name: isShortcut ? "Neo Ledger 快捷记账" : "Neo Ledger 通知转发",
    method: "POST",
    url: `${input.origin.replace(/\/+$/, "")}/api/v1/transactions`,
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": isShortcut ? "{{快捷指令运行ID}}" : "{{通知ID}}",
    },
    body: isShortcut
      ? {
          ledgerId: input.ledgerId,
          amount: "{{金额}}",
          merchant: "{{商户}}",
          category: "{{分类}}",
          source: "ios-shortcut",
          time: "{{当前日期ISO}}",
        }
      : {
          ledgerId: input.ledgerId,
          text: "{{通知全文}}",
          source: "notification-forwarder",
          time: "{{通知时间ISO}}",
        },
  };
  return JSON.stringify(template, null, 2);
}

export function testQuickSyncConnection(input: {
  token: string;
  ledgerId: number;
  idempotencyKey?: string;
  now?: Date;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ id?: number; error?: string }>("/api/v1/transactions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey ?? `ui-test-${Date.now()}`,
    },
    body: JSON.stringify({
      ledgerId: input.ledgerId,
      amount: 0.01,
      merchant: "自动记账连接测试",
      category: "餐饮",
      source: "connection-test",
      time: (input.now ?? new Date()).toISOString(),
    }),
  });
}
