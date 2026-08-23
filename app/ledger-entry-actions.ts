"use client";

import { useCallback, useRef } from "react";

export type EntryType = "支出" | "收入";
export type EntrySplitMode = "全额由我支付" | "全额由对方支付" | "按比例平摊";
type TransitionStarter = (callback: () => void | Promise<void>) => void;
type ParsedEntryLike = {
  amount: string;
  title: string;
  type: EntryType;
  category: string;
  incomeCategory: string;
  mood: string;
  accountId: number;
};

export function createEntrySubmissionGate() {
  let active = false;
  return {
    begin() {
      if (active) return false;
      active = true;
      return true;
    },
    end() {
      active = false;
    },
  };
}

export function decorateEntryFormData({
  formData,
  ledgerId,
  entryType,
  accountId,
  originalTimezone,
  mood,
  category,
  incomeCategory,
  splitMode,
  splitMemberId,
  mySharePercent,
}: {
  formData: FormData;
  ledgerId: number;
  entryType: EntryType;
  accountId: number;
  originalTimezone: string;
  mood: string;
  category: string;
  incomeCategory: string;
  splitMode: EntrySplitMode;
  splitMemberId: number;
  mySharePercent: number;
}) {
  formData.set("ledgerId", String(ledgerId));
  formData.set("type", entryType);
  formData.set("accountId", String(accountId));
  formData.set("originalTimezone", originalTimezone);
  if (entryType === "支出") {
    formData.set("mood", mood);
    formData.set("category", category);
    if (splitMemberId) {
      formData.set("splitMode", splitMode);
      formData.set("splitWithMemberId", String(splitMemberId));
      formData.set(
        "mySharePercent",
        String(
          splitMode === "按比例平摊"
            ? mySharePercent
            : splitMode === "全额由我支付"
              ? 0
              : 100,
        ),
      );
    }
  } else {
    formData.set("incomeCategory", incomeCategory);
  }
  return formData;
}

export function parsedEntryFormData(preview: ParsedEntryLike) {
  const formData = new FormData();
  formData.set("amount", preview.amount);
  formData.set("title", preview.title);
  formData.set("type", preview.type);
  formData.set("accountId", String(preview.accountId));
  if (preview.type === "支出") {
    formData.set("category", preview.category);
    formData.set("mood", preview.mood);
  } else formData.set("incomeCategory", preview.incomeCategory);
  return formData;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useLedgerEntryActions<Preview extends ParsedEntryLike>({
  ledgerId,
  entryType,
  accountId,
  mood,
  category,
  incomeCategory,
  splitMode,
  splitMemberId,
  mySharePercent,
  nudgeActive,
  reflection,
  reflectionPhrase,
  parsedPreview,
  startTransition,
  addTransaction,
  offlinePut,
  refreshOfflineCount,
  createOfflineId,
  isOnline,
  closeEntry,
  resetImport,
  resetSplit,
  notify,
}: {
  ledgerId: number;
  entryType: EntryType;
  accountId: number;
  mood: string;
  category: string;
  incomeCategory: string;
  splitMode: EntrySplitMode;
  splitMemberId: number;
  mySharePercent: number;
  nudgeActive: boolean;
  reflection: string;
  reflectionPhrase: string;
  parsedPreview: Preview | null;
  startTransition: TransitionStarter;
  addTransaction: (formData: FormData) => Promise<void>;
  offlinePut: (value: Record<string, unknown>) => Promise<void>;
  refreshOfflineCount: () => Promise<void>;
  createOfflineId: () => string;
  isOnline: () => boolean;
  closeEntry: () => void;
  resetImport: () => void;
  resetSplit: () => void;
  notify: (message: string, kind?: "warning" | "success") => void;
}) {
  const submissionGate = useRef(createEntrySubmissionGate());
  const submitEntry = useCallback(
    (formData: FormData) => {
      if (nudgeActive && reflection.trim() !== reflectionPhrase) {
        notify("阻尼模式已启动，请完整输入冷静期反思句后再提交。");
        return;
      }
      if (!submissionGate.current.begin()) {
        notify("上一笔流水正在提交，请稍候。");
        return;
      }
      const decorated = decorateEntryFormData({
        formData,
        ledgerId,
        entryType,
        accountId,
        originalTimezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
        mood,
        category,
        incomeCategory,
        splitMode,
        splitMemberId,
        mySharePercent,
      });
      if (!isOnline()) {
        const entry = Object.fromEntries(decorated.entries()) as Record<string, unknown>;
        entry.offlineId = createOfflineId();
        entry.occurredAt = String(entry.occurredAt || new Date().toISOString());
        startTransition(async () => {
          try {
            await offlinePut(entry);
            await refreshOfflineCount();
            closeEntry();
            resetSplit();
          } catch (error) {
            notify(errorMessage(error, "离线流水保存失败，请稍后重试"));
          } finally {
            submissionGate.current.end();
          }
        });
        return;
      }
      startTransition(async () => {
        try {
          await addTransaction(decorated);
          closeEntry();
          resetImport();
          resetSplit();
        } catch (error) {
          notify(errorMessage(error, "流水保存失败，请稍后重试"));
        } finally {
          submissionGate.current.end();
        }
      });
    },
    [accountId, addTransaction, category, closeEntry, createOfflineId, entryType, incomeCategory, isOnline, ledgerId, mood, mySharePercent, notify, nudgeActive, offlinePut, reflection, reflectionPhrase, refreshOfflineCount, resetImport, resetSplit, splitMemberId, splitMode, startTransition, submissionGate],
  );

  const confirmParsed = useCallback(() => {
    if (!parsedPreview) return;
    if (!submissionGate.current.begin()) {
      notify("上一笔流水正在提交，请稍候。");
      return;
    }
    const formData = parsedEntryFormData(parsedPreview);
    decorateEntryFormData({
      formData,
      ledgerId,
      entryType: parsedPreview.type,
      accountId: parsedPreview.accountId,
      originalTimezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
      mood: parsedPreview.mood,
      category: parsedPreview.category,
      incomeCategory: parsedPreview.incomeCategory,
      splitMode: "全额由我支付",
      splitMemberId: 0,
      mySharePercent: 50,
    });
    startTransition(async () => {
      try {
        await addTransaction(formData);
        resetImport();
        closeEntry();
      } catch (error) {
        notify(errorMessage(error, "解析流水保存失败，请稍后重试"));
      } finally {
        submissionGate.current.end();
      }
    });
  }, [addTransaction, closeEntry, ledgerId, notify, parsedPreview, resetImport, startTransition, submissionGate]);

  return { submitEntry, confirmParsed };
}
