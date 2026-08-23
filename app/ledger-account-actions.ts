"use client";

import { useCallback } from "react";
import { accountPayloadFromForm } from "./account-manager-state.ts";
import { fetchClientJson } from "./client-api.ts";
import { createClientId } from "./client-id.js";

type AccountLike = { id: number; type: "资产" | "负债"; updatedAt: string };
type TransitionStarter = (callback: () => void | Promise<void>) => void;
type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxBytes?: number,
) => Promise<{ response: Response; data: T | null }>;

export function createBillImportAccount(input: {
  ledgerId: number;
  name: string;
  type: "资产" | "负债";
  currency: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ id?: number; error?: string }>("/api/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ledgerId: input.ledgerId,
      name: input.name,
      type: input.type,
      balance: 0,
      billDay: null,
      repaymentDay: null,
      isInvestment: false,
      currency: input.currency,
      assetClass: "现金流",
    }),
  });
}

export function transferKind(targetType: "资产" | "负债" | undefined) {
  return targetType === "负债" ? "信用卡还款" : "账户转账";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function accountDeleteUrl(account: { id: number; updatedAt: string }) {
  const params = new URLSearchParams({
    id: String(account.id),
    expectedUpdatedAt: account.updatedAt,
  });
  return `/api/accounts?${params.toString()}`;
}

export function useLedgerAccountActions<Account extends AccountLike>({
  ledgerId,
  accountList,
  editingAccount,
  accountType,
  startTransition,
  setAccountError,
  setTransferError,
  reloadAccounts,
  closeAccount,
  closeTransfer,
  notifySuccess,
}: {
  ledgerId: number;
  accountList: Account[];
  editingAccount: Account | null;
  accountType: "资产" | "负债";
  startTransition: TransitionStarter;
  setAccountError: (value: string) => void;
  setTransferError: (value: string) => void;
  reloadAccounts: () => Promise<void>;
  closeAccount: () => void;
  closeTransfer: () => void;
  notifySuccess: (message: string) => void;
}) {
  const submitAccount = useCallback(
    (formData: FormData) => {
      startTransition(async () => {
        setAccountError("");
        try {
          const payload = accountPayloadFromForm({
            ledgerId,
            id: editingAccount?.id,
            expectedUpdatedAt: editingAccount?.updatedAt,
            accountType,
            formData,
          });
          const { response, data } = await fetchClientJson<{ error?: string }>(
            `/api/accounts?ledger=${ledgerId}`,
            {
              method: editingAccount ? "PUT" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );
          if (!response.ok) {
            setAccountError(data?.error ?? "保存失败");
            return;
          }
          await reloadAccounts();
          closeAccount();
        } catch (error) {
          setAccountError(errorMessage(error, "保存失败，请稍后重试"));
        }
      });
    },
    [accountType, closeAccount, editingAccount, ledgerId, reloadAccounts, setAccountError, startTransition],
  );

  const submitTransfer = useCallback(
    (formData: FormData) => {
      const fromAccountId = Number(formData.get("fromAccountId"));
      const toAccountId = Number(formData.get("toAccountId"));
      const target = accountList.find((item) => item.id === toAccountId);
      const idempotencyKey = createClientId();
      startTransition(async () => {
        setTransferError("");
        try {
          const { response, data } = await fetchClientJson<{ error?: string }>(
            "/api/transfers",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ledgerId,
                kind: transferKind(target?.type),
                idempotencyKey,
                fromAccountId,
                toAccountId,
                amount: Number(formData.get("amount")),
                occurredAt: new Date().toISOString(),
                originalTimezone:
                  Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
                note: String(formData.get("note") || ""),
              }),
            },
          );
          if (!response.ok) {
            setTransferError(data?.error ?? "转账失败");
            return;
          }
          await reloadAccounts();
          closeTransfer();
          notifySuccess(
            target?.type === "负债"
              ? "还款已同时更新资产与负债。"
              : "账户转账已完成。",
          );
        } catch (error) {
          setTransferError(errorMessage(error, "转账失败，请稍后重试"));
        }
      });
    },
    [accountList, closeTransfer, ledgerId, notifySuccess, reloadAccounts, setTransferError, startTransition],
  );

  const removeAccount = useCallback(() => {
    if (!editingAccount) return;
    startTransition(async () => {
      setAccountError("");
      try {
        const { response, data } = await fetchClientJson<{ error?: string }>(
          accountDeleteUrl(editingAccount),
          { method: "DELETE" },
        );
        if (!response.ok) {
          setAccountError(data?.error ?? "注销失败");
          return;
        }
        await reloadAccounts();
        closeAccount();
      } catch (error) {
        setAccountError(errorMessage(error, "注销失败，请稍后重试"));
      }
    });
  }, [closeAccount, editingAccount, reloadAccounts, setAccountError, startTransition]);

  return { submitAccount, submitTransfer, removeAccount };
}
