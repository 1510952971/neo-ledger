"use client";

import { useCallback } from "react";
import { fetchClientJson } from "./client-api.ts";

type TransactionEditDraftLike = {
  transaction: { id: number; updatedAt: string };
  type: string;
  accountId: number;
  mood: string;
  category: string;
  incomeCategory: string;
};
type TransitionStarter = (callback: () => void | Promise<void>) => void;

export function transactionEditPayloadFromForm<Draft extends TransactionEditDraftLike>({
  ledgerId,
  draft,
  formData,
  originalTimezone,
}: {
  ledgerId: number;
  draft: Draft;
  formData: FormData;
  originalTimezone: string;
}) {
  return {
    id: draft.transaction.id,
    ledgerId,
    expectedUpdatedAt: draft.transaction.updatedAt,
    title: String(formData.get("title") || ""),
    amount: Number(formData.get("amount")),
    occurredAt: String(formData.get("occurredAt") || ""),
    originalTimezone,
    type: draft.type,
    accountId: draft.accountId,
    mood: draft.mood,
    category: draft.category,
    incomeCategory: draft.incomeCategory,
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useLedgerTransactionActions<Draft extends TransactionEditDraftLike>({
  ledgerId,
  draft,
  startTransition,
  setError,
  closeEditor,
  reloadLedger,
  notifySuccess,
}: {
  ledgerId: number;
  draft: Draft | null;
  startTransition: TransitionStarter;
  setError: (value: string) => void;
  closeEditor: () => void;
  reloadLedger: () => Promise<void>;
  notifySuccess: (message: string) => void;
}) {
  const submitTransactionEdit = useCallback(
    (formData: FormData) => {
      if (!draft) return;
      setError("");
      startTransition(async () => {
        try {
          const originalTimezone =
            Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
          const { response, data } = await fetchClientJson<{ error?: string }>(
            "/api/transactions",
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                transactionEditPayloadFromForm({
                  ledgerId,
                  draft,
                  formData,
                  originalTimezone,
                }),
              ),
            },
          );
          if (!response.ok) {
            setError(data?.error || "修改失败");
            return;
          }
          closeEditor();
          notifySuccess("账单已修改，关联账户余额已同步修正。");
          // The write is already committed; a refresh failure should not turn a
          // successful edit into a misleading form error.
          await reloadLedger().catch(() => undefined);
        } catch (error) {
          setError(errorMessage(error, "修改失败，请稍后重试"));
        }
      });
    },
    [closeEditor, draft, ledgerId, notifySuccess, reloadLedger, setError, startTransition],
  );

  return { submitTransactionEdit };
}
