"use client";

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { fetchClientJson } from "./client-api.ts";

export type LedgerStateSetter<T> = (value: T | ((current: T) => T)) => void;

export type LedgerRefreshAccount = { id: number };
export type LedgerRefreshCategory = { name: string; isActive: boolean };

export type LedgerRefreshRequest = {
  ledgerId: number;
  generation: number;
  controller: AbortController;
};

/**
 * State writes are allowed only while the request belongs to the currently
 * selected ledger and has not been cancelled by a ledger switch/unmount.
 */
export function isLedgerRefreshRequestCurrent(
  request: LedgerRefreshRequest,
  current: LedgerRefreshRequest | null,
) {
  return request === current && !request.controller.signal.aborted;
}

export function keepActiveSelection(
  current: string,
  rows: LedgerRefreshCategory[],
  fallback: string,
) {
  const activeNames = rows.filter((row) => row.isActive).map((row) => row.name);
  return activeNames.includes(current) ? current : (activeNames[0] ?? fallback);
}

async function readJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const { response, data } = await fetchClientJson<T>(url, {
      cache: "no-store",
      signal,
    });
    return response.ok ? data : null;
  } catch (error) {
    // A ledger switch intentionally aborts in-flight reads. Do not surface a
    // cancellation as a refresh failure or let stale work update the UI.
    if (signal.aborted) return null;
    throw error;
  }
}

export function useLedgerRefresh<
  Account extends LedgerRefreshAccount,
  Goal,
  Subscription,
  DigitalAsset,
  Category extends LedgerRefreshCategory,
  CategoryBudget,
>({
  ledgerId,
  refreshRoute,
  setAccounts,
  setAccountId,
  setGoals,
  setSubscriptions,
  setDigitalAssets,
  setCategories,
  setCategory,
  setCategoryBudgets,
  setIncomeCategories,
  setIncomeCategory,
}: {
  ledgerId: number;
  refreshRoute: () => void;
  setAccounts: LedgerStateSetter<Account[]>;
  setAccountId: LedgerStateSetter<number>;
  setGoals: LedgerStateSetter<Goal[]>;
  setSubscriptions: LedgerStateSetter<Subscription[]>;
  setDigitalAssets: LedgerStateSetter<DigitalAsset[]>;
  setCategories: LedgerStateSetter<Category[]>;
  setCategory: LedgerStateSetter<string>;
  setCategoryBudgets: LedgerStateSetter<CategoryBudget[]>;
  setIncomeCategories: LedgerStateSetter<Category[]>;
  setIncomeCategory: LedgerStateSetter<string>;
}) {
  const requestRef = useRef<LedgerRefreshRequest | null>(null);
  const requestForLedger = useMemo<LedgerRefreshRequest>(
    () => ({
      ledgerId,
      generation: 0,
      controller: new AbortController(),
    }),
    [ledgerId],
  );

  // React Strict Mode runs an effect cleanup/setup pair during development.
  // Recreate an already-aborted request during the second setup so that this
  // dev-only lifecycle does not disable the hook for the rest of the session.
  useLayoutEffect(() => {
    const previous = requestRef.current;
    if (previous && previous !== requestForLedger) previous.controller.abort("ledger changed");
    requestRef.current = requestForLedger.controller.signal.aborted
      ? {
          ledgerId,
          generation: (previous?.generation ?? requestForLedger.generation) + 1,
          controller: new AbortController(),
        }
      : {
          ...requestForLedger,
          generation: previous ? previous.generation + 1 : requestForLedger.generation,
        };
    return () => {
      const active = requestRef.current;
      if (active?.ledgerId === ledgerId) active.controller.abort("refresh hook unmounted");
    };
  }, [ledgerId, requestForLedger]);

  const reloadAccounts = useCallback(async () => {
    const request = requestRef.current;
    if (!request) return;
    const rows = await readJson<Account[]>(
      `/api/accounts?ledger=${ledgerId}`,
      request.controller.signal,
    );
    if (!rows || !isLedgerRefreshRequestCurrent(request, requestRef.current)) return;
    setAccounts(rows);
    setAccountId((current) =>
      rows.some((item) => item.id === current) ? current : (rows[0]?.id ?? 0),
    );
  }, [ledgerId, setAccountId, setAccounts]);

  const reloadGoals = useCallback(async () => {
    const request = requestRef.current;
    if (!request) return;
    const rows = await readJson<Goal[]>(
      `/api/savings-goals?ledger=${ledgerId}`,
      request.controller.signal,
    );
    if (rows && isLedgerRefreshRequestCurrent(request, requestRef.current)) setGoals(rows);
  }, [ledgerId, setGoals]);

  const reloadSubscriptions = useCallback(async () => {
    const request = requestRef.current;
    if (!request) return;
    const rows = await readJson<Subscription[]>(
      `/api/subscriptions?ledger=${ledgerId}`,
      request.controller.signal,
    );
    if (rows && isLedgerRefreshRequestCurrent(request, requestRef.current))
      setSubscriptions(rows);
  }, [ledgerId, setSubscriptions]);

  const reloadDigitalAssets = useCallback(async () => {
    const request = requestRef.current;
    if (!request) return;
    const rows = await readJson<DigitalAsset[]>(
      `/api/assets?ledger=${ledgerId}`,
      request.controller.signal,
    );
    if (rows && isLedgerRefreshRequestCurrent(request, requestRef.current))
      setDigitalAssets(rows);
  }, [ledgerId, setDigitalAssets]);

  const reloadCategories = useCallback(async () => {
    const request = requestRef.current;
    if (!request) return;
    const [categories, budgets] = await Promise.all([
      readJson<Category[]>(`/api/categories?ledger=${ledgerId}`, request.controller.signal),
      readJson<CategoryBudget[]>(
        `/api/category-budgets?ledger=${ledgerId}`,
        request.controller.signal,
      ),
    ]);
    if (!isLedgerRefreshRequestCurrent(request, requestRef.current)) return;
    if (categories) {
      setCategories(categories);
      setCategory((current) => keepActiveSelection(current, categories, "餐饮"));
    }
    if (budgets) setCategoryBudgets(budgets);
  }, [ledgerId, setCategories, setCategory, setCategoryBudgets]);

  const reloadIncomeCategories = useCallback(async () => {
    const request = requestRef.current;
    if (!request) return;
    const categories = await readJson<Category[]>(
      `/api/income-categories?ledger=${ledgerId}`,
      request.controller.signal,
    );
    if (!categories || !isLedgerRefreshRequestCurrent(request, requestRef.current)) return;
    setIncomeCategories(categories);
    setIncomeCategory((current) =>
      keepActiveSelection(current, categories, "薪资发放"),
    );
  }, [ledgerId, setIncomeCategories, setIncomeCategory]);

  const refreshLedger = useCallback(
    async (extra: Array<() => Promise<void>> = []) => {
      refreshRoute();
      await Promise.all([reloadAccounts(), ...extra.map((run) => run())]);
    },
    [refreshRoute, reloadAccounts],
  );

  return {
    reloadAccounts,
    reloadGoals,
    reloadSubscriptions,
    reloadDigitalAssets,
    reloadCategories,
    reloadIncomeCategories,
    refreshLedger,
  };
}
