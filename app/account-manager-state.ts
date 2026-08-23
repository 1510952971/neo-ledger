"use client";

import { useReducer, type SetStateAction } from "react";

export type AccountManagerState<Account> = {
  accounts: Account[];
  transferOpen: boolean;
  open: boolean;
  editing: Account | null;
  accountType: "资产" | "负债";
  editorError: string;
  transferError: string;
};

type AccountManagerAction<Account> =
  | { type: "open"; account: Account | null; accountType: "资产" | "负债" }
  | { type: "field"; key: keyof AccountManagerState<Account>; value: SetStateAction<AccountManagerState<Account>[keyof AccountManagerState<Account>]> }
  | { type: "set-open"; value: SetStateAction<boolean> }
  | { type: "account-type"; value: "资产" | "负债" }
  | { type: "editor-error"; value: string }
  | { type: "transfer-error"; value: string };

export function initialAccountManagerState<Account>(input: { accounts?: Account[] } = {}): AccountManagerState<Account> {
  return { accounts: input.accounts ?? [], transferOpen: false, open: false, editing: null, accountType: "资产", editorError: "", transferError: "" };
}

export function accountManagerReducer<Account>(state: AccountManagerState<Account>, action: AccountManagerAction<Account>): AccountManagerState<Account> {
  if (action.type === "field") {
    const current = state[action.key];
    const value = typeof action.value === "function"
      ? (action.value as (previous: typeof current) => typeof current)(current)
      : action.value;
    return { ...state, [action.key]: value };
  }
  if (action.type === "open")
    return { ...state, open: true, editing: action.account, accountType: action.accountType, editorError: "" };
  if (action.type === "set-open") {
    const open = typeof action.value === "function" ? action.value(state.open) : action.value;
    return { ...state, open };
  }
  if (action.type === "account-type") return { ...state, accountType: action.value, editorError: "" };
  if (action.type === "editor-error") return { ...state, editorError: action.value };
  return { ...state, transferError: action.value };
}

export function useAccountManagerState<Account extends { type: "资产" | "负债" }>(input: { accounts?: Account[] } = {}) {
  const [state, dispatch] = useReducer(accountManagerReducer<Account>, input, initialAccountManagerState<Account>);
  const setter = <Key extends keyof AccountManagerState<Account>>(key: Key) =>
    (value: SetStateAction<AccountManagerState<Account>[Key]>) =>
      dispatch({ type: "field", key, value } as AccountManagerAction<Account>);
  return {
    ...state,
    setAccounts: setter("accounts"),
    setTransferOpen: setter("transferOpen"),
    openEditor: (account: Account | null) => dispatch({ type: "open", account, accountType: account?.type ?? "资产" }),
    setOpen: (value: SetStateAction<boolean>) => dispatch({ type: "set-open", value }),
    setAccountType: (value: "资产" | "负债") => dispatch({ type: "account-type", value }),
    setEditorError: (value: string) => dispatch({ type: "editor-error", value }),
    setTransferError: (value: string) => dispatch({ type: "transfer-error", value }),
  };
}

export function accountPayloadFromForm(input: {
  ledgerId: number;
  id?: number;
  expectedUpdatedAt?: string;
  accountType: "资产" | "负债";
  formData: FormData;
}) {
  const { formData, accountType } = input;
  return {
    ledgerId: input.ledgerId,
    id: input.id,
    ...(input.id && input.expectedUpdatedAt
      ? { expectedUpdatedAt: input.expectedUpdatedAt }
      : {}),
    name: String(formData.get("name") || ""),
    type: accountType,
    balance: Number(formData.get("balance")),
    billDay: accountType === "负债" ? Number(formData.get("billDay")) : null,
    repaymentDay: accountType === "负债" ? Number(formData.get("repaymentDay")) : null,
    isInvestment: accountType === "资产" && formData.get("isInvestment") === "on",
    currency: String(formData.get("currency") || "CNY"),
    assetClass: String(formData.get("assetClass") || "现金流"),
  };
}
