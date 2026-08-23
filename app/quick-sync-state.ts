"use client";

import { useReducer, type SetStateAction } from "react";

export type QuickSyncStatus = {
  active: boolean;
  tokenPrefix?: string;
  label?: string;
  scope?: string;
  expiresAt?: string;
  createdAt?: string;
  lastUsedAt?: string | null;
  processedCount?: number;
  lastEventAt?: string | null;
};

export type QuickSyncState = {
  status: QuickSyncStatus | null;
  token: string;
  message: string;
  label: string;
  expiryDays: number;
};

type QuickSyncAction =
  | { type: "status"; value: QuickSyncStatus | null }
  | { type: "token"; value: string }
  | { type: "message"; value: string }
  | { type: "label"; value: string }
  | { type: "expiry"; value: number }
  | { type: "created"; status: QuickSyncStatus; token: string; label: string }
  | { type: "revoked" };

export const initialQuickSyncState: QuickSyncState = {
  status: null,
  token: "",
  message: "",
  label: "自动记账连接",
  expiryDays: 365,
};

export function quickSyncReducer(state: QuickSyncState, action: QuickSyncAction): QuickSyncState {
  if (action.type === "created")
    return { ...state, status: { ...action.status, active: true, label: action.label }, token: action.token, message: "新密钥只显示这一次，请立即复制保存。" };
  if (action.type === "revoked")
    return { ...state, status: { active: false }, token: "", message: "自动记账密钥已撤销。" };
  if (action.type === "status") return { ...state, status: action.value };
  if (action.type === "token") return { ...state, token: action.value };
  if (action.type === "message") return { ...state, message: action.value };
  if (action.type === "label") return { ...state, label: action.value };
  return { ...state, expiryDays: action.value };
}

export function useQuickSyncState() {
  const [state, dispatch] = useReducer(quickSyncReducer, initialQuickSyncState);
  return {
    ...state,
    setStatus: (value: SetStateAction<QuickSyncStatus | null>) => {
      const next = typeof value === "function" ? value(state.status) : value;
      dispatch({ type: "status", value: next });
    },
    setToken: (value: string) => dispatch({ type: "token", value }),
    setMessage: (value: string) => dispatch({ type: "message", value }),
    setLabel: (value: string) => dispatch({ type: "label", value }),
    setExpiryDays: (value: number) => dispatch({ type: "expiry", value }),
    created: (status: QuickSyncStatus, token: string, label: string) => dispatch({ type: "created", status, token, label }),
    revoked: () => dispatch({ type: "revoked" }),
  };
}
