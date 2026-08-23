"use client";

import { useState, type RefObject } from "react";
import { CollectionPagination } from "./collection-pagination";
import {
  billPeriodLabel,
  billWeekValue,
  dateKeyFromBillWeek,
  setBillAnchorMonth,
  setBillAnchorYear,
  shiftBillAnchor,
} from "./bill-period.js";
import type { BillRange } from "./bill-query-core";
import { formatAppDateTime } from "./date-format";

export type BillSectionRow = {
  id: number;
  title: string;
  type: "支出" | "收入";
  category: string | null;
  incomeCategory: string | null;
  mood: string | null;
  currency: string;
  accountId: number;
  amount: number;
  occurredAt: string;
};

type BillPage = {
  rows: BillSectionRow[];
  page: number;
  totalPages: number;
  totalRows: number;
};

type ReconciliationState = {
  selectedIds: number[];
  pending: boolean;
  rows: Record<number, { status?: string } | undefined>;
  toggle: (id: number, selected: boolean) => void;
  mark: (status: "reconciled" | "exception" | "unreconciled") => void | Promise<void>;
  clear: () => void;
};

type BillMeta = Record<string, { emoji: string; color: string }>;
type BillResult = { rows: BillSectionRow[]; income: number; expense: number; balance: number };
type AccountOption = { id: number; name: string };

const money = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
});

const currencyFormat = (amount: number, currency: string) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(amount);

const displayDate = (value: string) => {
  return formatAppDateTime(value);
};

export function BillSection({
  sectionRef,
  billPage,
  billResults,
  totalTransactions,
  billQuery,
  onBillQueryChange,
  billRange,
  onBillRangeChange,
  billAnchorDate,
  onBillAnchorChange,
  billAnchorKey,
  todayKey,
  billPeriodYears,
  billStartDate,
  billEndDate,
  onBillStartDateChange,
  onBillEndDateChange,
  onResetFilters,
  reconciliation,
  accountList,
  categoryMeta,
  incomeMeta,
  exchangeRates,
  dateLabels,
  pending,
  loading,
  error,
  onEdit,
  onDelete,
  optimisticDeletedIds,
  onPageChange,
  onOpenEntry,
}: {
  sectionRef: RefObject<HTMLElement | null>;
  billPage: BillPage;
  billResults: BillResult;
  totalTransactions: number;
  billQuery: string;
  onBillQueryChange: (value: string) => void;
  billRange: BillRange;
  onBillRangeChange: (value: BillRange) => void;
  billAnchorDate: string;
  onBillAnchorChange: (value: string) => void;
  billAnchorKey: string;
  todayKey: string;
  billPeriodYears: number[];
  billStartDate: string;
  billEndDate: string;
  onBillStartDateChange: (value: string) => void;
  onBillEndDateChange: (value: string) => void;
  onResetFilters: () => void;
  reconciliation: ReconciliationState;
  accountList: AccountOption[];
  categoryMeta: BillMeta;
  incomeMeta: BillMeta;
  exchangeRates: Record<string, number>;
  dateLabels: Record<number, string>;
  pending: boolean;
  loading: boolean;
  error: string | null;
  onEdit: (row: BillSectionRow) => void;
  onDelete: (id: number) => void;
  optimisticDeletedIds: Set<number>;
  onPageChange: (page: number) => void;
  onOpenEntry: () => void;
}) {
  const periodRange = billRange === "day" || billRange === "week" || billRange === "month" || billRange === "year";
  const accountNames = new Map(accountList.map((item) => [item.id, item.name]));
  const [removingIds, setRemovingIds] = useState<Set<number>>(() => new Set());
  const removedRows = billPage.rows.filter((item) => optimisticDeletedIds.has(item.id));
  const visiblePageRows = billPage.rows.filter((item) => !optimisticDeletedIds.has(item.id));
  const visibleResultRows = billResults.rows.filter((item) => !optimisticDeletedIds.has(item.id));
  const removedIncome = removedRows
    .filter((item) => item.type === "收入")
    .reduce((sum, item) => sum + item.amount * (exchangeRates[item.currency] ?? 1), 0);
  const removedExpense = removedRows
    .filter((item) => item.type === "支出")
    .reduce((sum, item) => sum + item.amount * (exchangeRates[item.currency] ?? 1), 0);
  const visibleResults = {
    rows: visibleResultRows,
    income: Math.max(0, billResults.income - removedIncome),
    expense: Math.max(0, billResults.expense - removedExpense),
    balance: billResults.balance - removedIncome + removedExpense,
  };
  const visiblePage = {
    ...billPage,
    rows: visiblePageRows,
    totalRows: Math.max(0, billPage.totalRows - removedRows.length),
  };
  const visibleTotalTransactions = Math.max(0, totalTransactions - removedRows.length);
  function removeAfterAnimation(id: number) {
    if (removingIds.has(id)) return;
    setRemovingIds((current) => new Set(current).add(id));
    window.setTimeout(() => {
      setRemovingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      onDelete(id);
    }, 180);
  }
  return (
    <section className="ledger-section module-bills page-scroll-anchor" ref={sectionRef}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">TRANSACTION SEARCH</p>
          <h2>账单明细</h2>
        </div>
        <span>{visiblePage.totalRows} / {visibleTotalTransactions} 笔记录</span>
      </div>
      <div className="bill-query-panel">
        <label className="bill-search-box">
          <span>⌕</span>
          <input value={billQuery} onChange={(event) => onBillQueryChange(event.target.value)} placeholder="搜索商户、分类、账户、金额或日期" aria-label="搜索账单明细" />
          {billQuery && <button onClick={() => onBillQueryChange("")} aria-label="清空搜索">×</button>}
        </label>
        <div className="bill-range-tabs" aria-label="账单时间范围">
          {([ ["all", "全部"], ["day", "日"], ["week", "周"], ["month", "月"], ["year", "年"], ["custom", "自定义"] ] as [BillRange, string][]).map(([value, label]) => (
            <button className={billRange === value ? "active" : ""} onClick={() => {
              if (value !== "all" && value !== "custom") {
                const anchor = billAnchorDate || todayKey;
                if (anchor) onBillAnchorChange(anchor);
              }
              onBillRangeChange(value);
            }} key={value}>{label}</button>
          ))}
        </div>
        {billAnchorKey && periodRange && (
          <div className="bill-period-navigator">
            <button className="bill-period-arrow" aria-label="查看上一期" title="上一期" onClick={() => onBillAnchorChange(shiftBillAnchor(billAnchorKey, billRange, -1))}>‹</button>
            <div className="bill-period-picker">
              <strong>{billPeriodLabel(billRange, billAnchorKey)}</strong>
              {billRange === "day" && <input type="date" value={billAnchorKey} aria-label="选择日期" onChange={(event) => onBillAnchorChange(event.target.value)} />}
              {billRange === "week" && <input type="week" value={billWeekValue(billAnchorKey)} aria-label="选择周" onChange={(event) => onBillAnchorChange(dateKeyFromBillWeek(event.target.value, billAnchorKey))} />}
              {billRange === "month" && <input type="month" value={billAnchorKey.slice(0, 7)} aria-label="选择月份" onChange={(event) => onBillAnchorChange(setBillAnchorMonth(billAnchorKey, event.target.value))} />}
              {billRange === "year" && <select value={billAnchorKey.slice(0, 4)} aria-label="选择年份" onChange={(event) => onBillAnchorChange(setBillAnchorYear(billAnchorKey, Number(event.target.value)))}>
                {billPeriodYears.map((year) => <option value={year} key={year}>{year} 年</option>)}
              </select>}
            </div>
            <button className="bill-period-current" onClick={() => onBillAnchorChange(todayKey)}>本期</button>
            <button className="bill-period-arrow" aria-label="查看下一期" title="下一期" onClick={() => onBillAnchorChange(shiftBillAnchor(billAnchorKey, billRange, 1))}>›</button>
          </div>
        )}
        {billRange === "custom" && (
          <div className="bill-advanced-filter bill-custom-range">
            <label><span>开始日期</span><input type="date" value={billStartDate} max={billEndDate || undefined} onChange={(event) => onBillStartDateChange(event.target.value)} /></label>
            <i>至</i>
            <label><span>结束日期</span><input type="date" value={billEndDate} min={billStartDate || undefined} onChange={(event) => onBillEndDateChange(event.target.value)} /></label>
            {(billStartDate || billEndDate) && <button onClick={() => { onBillStartDateChange(""); onBillEndDateChange(""); }}>清除日期</button>}
          </div>
        )}
        <div className="bill-result-summary">
          <div><span>筛选收入</span><strong className="income">{money.format(visibleResults.income / 100)}</strong></div>
          <div><span>筛选支出</span><strong>{money.format(visibleResults.expense / 100)}</strong></div>
          <div><span>净收支</span><strong className={visibleResults.balance >= 0 ? "income" : "expense"}>{money.format(visibleResults.balance / 100)}</strong></div>
        </div>
        {reconciliation.selectedIds.length > 0 && (
          <div className="reconciliation-toolbar" role="region" aria-label="批量对账操作">
            <strong>已选择 {reconciliation.selectedIds.length} 笔</strong>
            <button type="button" onClick={() => void reconciliation.mark("reconciled")} disabled={reconciliation.pending}>标记已核对</button>
            <button type="button" onClick={() => void reconciliation.mark("exception")} disabled={reconciliation.pending}>标记异常</button>
            <button type="button" onClick={() => void reconciliation.mark("unreconciled")} disabled={reconciliation.pending}>取消核对</button>
            <button type="button" onClick={reconciliation.clear}>清除选择</button>
          </div>
        )}
      </div>
      {loading && !visiblePageRows.length ? (
        <div className="bill-no-results"><span>⌛</span><h3>正在读取账单</h3><p>正在从账本中加载这一页流水。</p></div>
      ) : error ? (
        <div className="bill-no-results"><span>!</span><h3>账单读取失败</h3><p>{error}</p></div>
      ) : visibleResultRows.length ? (
        <>
          <div className="expense-list">
            {visiblePageRows.map((item) => {
              const icon = item.type === "收入" ? incomeMeta[item.incomeCategory ?? "其它收入"].emoji : categoryMeta[item.category ?? "餐饮"].emoji;
              const reconciliationStatus = reconciliation.rows[item.id]?.status ?? "unreconciled";
              return (
                <article className={`expense-item${removingIds.has(item.id) ? " is-removing" : ""}`} key={item.id}>
                  <label className="transaction-select" title="选择流水"><input type="checkbox" checked={reconciliation.selectedIds.includes(item.id)} onChange={(event) => reconciliation.toggle(item.id, event.target.checked)} aria-label={`选择${item.title}`} /></label>
                  <div className="expense-icon category-icon">{icon}</div>
                  <div className="expense-main"><h3>{item.title}</h3><p>{dateLabels[item.id] ?? displayDate(item.occurredAt)} · {accountNames.get(item.accountId) ?? "未命名账户"} · {item.type === "收入" ? item.incomeCategory : item.category}</p></div>
                  <span className={`flow-type ${item.type === "收入" ? "income" : ""}`}>{item.type}</span>
                  <span className={`reconciliation-status ${reconciliationStatus}`} title="对账状态">{reconciliationStatus === "reconciled" ? "已核对" : reconciliationStatus === "exception" ? "异常" : "未核对"}</span>
                  <strong className={item.type === "收入" ? "income-money" : ""}>{item.type === "收入" ? "+" : "-"}{currencyFormat(item.amount / 100, item.currency)}{item.currency !== "CNY" && <small className="converted-money">折合 {money.format((item.amount * (exchangeRates[item.currency] ?? 1)) / 100)}</small>}</strong>
                  <div className="bill-row-actions">
                    <button className="edit-button" aria-label={`修改${item.title}`} title="修改账单" disabled={pending} onClick={() => onEdit(item)}>✎</button>
                    <button className="delete-button" aria-label={`删除${item.title}`} title="删除账单" disabled={pending || removingIds.has(item.id)} onClick={() => removeAfterAnimation(item.id)}>🗑</button>
                  </div>
                </article>
              );
            })}
          </div>
          <CollectionPagination page={visiblePage.page} totalPages={visiblePage.totalPages} totalRows={visiblePage.totalRows} label="账单分页" unit="条" onChange={onPageChange} />
        </>
      ) : visibleTotalTransactions ? (
        <div className="bill-no-results"><span>⌕</span><h3>没有找到匹配的账单</h3><p>试试更换关键词或放宽时间范围。</p><button onClick={onResetFilters}>重置筛选</button></div>
      ) : (
        <div className="empty-state"><div className="empty-flower">✿</div><h3>财务舱等待第一笔数据</h3><p>记一笔，让账户和分析系统开始运转。</p><button onClick={onOpenEntry}>开始记账</button></div>
      )}
    </section>
  );
}
