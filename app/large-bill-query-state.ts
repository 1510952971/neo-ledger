"use client";

import { useEffect, useMemo, useState } from "react";
import type { BillRange } from "./bill-query-core";
import { DEFAULT_CLIENT_RESPONSE_BYTES, fetchClientJson } from "./client-api.ts";

export type RemoteBillRow = {
  id: number;
  title: string;
  amount: number;
  type: "支出" | "收入";
  mood: string | null;
  category: string | null;
  incomeCategory: string | null;
  accountId: number;
  currency: string;
  occurredAt: string;
  updatedAt: string;
  createdAt: string;
  splitWithMemberId: number | null;
  splitMode: string | null;
  mySharePercent: number;
  installmentId: number | null;
  installmentNumber: number | null;
  isSideHustle: boolean;
};

type QueryResponse = {
  items?: RemoteBillRow[];
  total?: number;
  income?: number;
  expense?: number;
  balance?: number;
  nextCursor?: string | null;
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthEnd(anchor: string) {
  const date = new Date(`${anchor.slice(0, 7)}-01T12:00:00`);
  date.setMonth(date.getMonth() + 1, 0);
  return dateKey(date);
}

function rangeDates(range: BillRange, anchor: string, startDate: string, endDate: string) {
  if (range === "custom") return { from: startDate, to: endDate };
  if (!anchor || range === "all") return { from: "", to: "" };
  if (range === "day") return { from: anchor, to: anchor };
  if (range === "month") return { from: `${anchor.slice(0, 7)}-01`, to: monthEnd(anchor) };
  if (range === "year") return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` };
  const date = new Date(`${anchor}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const from = dateKey(date);
  date.setDate(date.getDate() + 6);
  return { from, to: dateKey(date) };
}

export function useLargeBillQuery({
  enabled,
  ledgerId,
  revision,
  page,
  pageSize,
  query,
  range,
  anchor,
  startDate,
  endDate,
}: {
  enabled: boolean;
  ledgerId: number;
  revision: number;
  page: number;
  pageSize: number;
  query: string;
  range: BillRange;
  anchor: string;
  startDate: string;
  endDate: string;
}) {
  const [state, setState] = useState<{ key: string; queryKey: string; rows: RemoteBillRow[]; total: number; income: number; expense: number; balance: number; loading: boolean; error: string | null } | null>(null);
  const dates = useMemo(() => rangeDates(range, anchor, startDate, endDate), [range, anchor, startDate, endDate]);
  const offset = -new Date().getTimezoneOffset();
  const queryKey = JSON.stringify([ledgerId, page, pageSize, query, range, anchor, startDate, endDate, offset]);
  const key = JSON.stringify([revision, queryKey]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let cancelled = false;
    const load = async () => {
      let cursor: string | null = null;
      let pageRows: RemoteBillRow[] = [];
      let total = 0;
      let income = 0;
      let expense = 0;
      let balance = 0;
      for (let currentPage = 1; currentPage <= page; currentPage += 1) {
        const params = new URLSearchParams({ ledger: String(ledgerId), limit: String(pageSize), offset: String(offset) });
        if (cursor) params.set("cursor", cursor);
        if (query.trim()) params.set("q", query.trim());
        if (dates.from) params.set("from", dates.from);
        if (dates.to) params.set("to", dates.to);
        const { response, data } = await fetchClientJson<QueryResponse>(`/api/transactions/query?${params.toString()}`, { cache: "no-store", signal: controller.signal }, DEFAULT_CLIENT_RESPONSE_BYTES);
        if (!response.ok) throw new Error("账单查询失败");
        const items = Array.isArray(data?.items) ? data.items : [];
        pageRows = items;
        total = Number(data?.total ?? 0);
        income = Number(data?.income ?? 0);
        expense = Number(data?.expense ?? 0);
        balance = Number(data?.balance ?? income - expense);
        cursor = typeof data?.nextCursor === "string" ? data.nextCursor : null;
        if (currentPage < page && !cursor) break;
      }
      if (!cancelled) setState({ key, queryKey, rows: pageRows, total, income, expense, balance, loading: false, error: null });
    };
    void load().catch(() => {
      if (!cancelled) setState({ key, queryKey, rows: [], total: 0, income: 0, expense: 0, balance: 0, loading: false, error: "账单暂时无法读取，请刷新后重试。" });
    });
    return () => {
      cancelled = true;
      controller.abort("bill query changed");
    };
  }, [enabled, ledgerId, page, pageSize, query, dates.from, dates.to, offset, key, queryKey]);
  if (!enabled) return null;
  if (state?.key === key) return state;
  // Keep the current page painted while a post-mutation refresh is running.
  // Filter changes still show a clean loading state so stale results never
  // appear under a different search or date range.
  return state?.queryKey === queryKey
    ? { key, queryKey, rows: state.rows, total: state.total, income: state.income, expense: state.expense, balance: state.balance, loading: true, error: null }
    : { key, queryKey, rows: [], total: 0, income: 0, expense: 0, balance: 0, loading: true, error: null };
}
