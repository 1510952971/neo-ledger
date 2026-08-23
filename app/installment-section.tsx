"use client";

import type { RefObject } from "react";
import { CollectionPagination } from "./collection-pagination";
import { installmentPresentation } from "./installment-presentation.js";

type Currency = "CNY" | "USD" | "JPY" | "EUR";
export type InstallmentListItem = { id: number; ledgerId: number; name: string; totalAmount: number; periods: number; paidPeriods: number; feeAmount: number; accountId: number; startMonth: string; chargeDay: number; currency: Currency; updatedAt: string; createdAt: string };
const formatCurrency = (amount: number, currency: Currency) => new Intl.NumberFormat("zh-CN", { style: "currency", currency, minimumFractionDigits: currency === "JPY" ? 0 : 2 }).format(amount);

export function InstallmentSection({ sectionRef, rows, totalRows, page, totalPages, onAdd, onDelete, onPageChange }: {
  sectionRef: RefObject<HTMLElement | null>;
  rows: InstallmentListItem[];
  totalRows: number;
  page: number;
  totalPages: number;
  onAdd: () => void;
  onDelete: (item: InstallmentListItem) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <section className="installment-section module-planning page-scroll-anchor" ref={sectionRef}>
      <div className="section-heading account-heading">
        <div><p className="eyebrow">INSTALLMENT PLAN</p><h2>📈 分期付款</h2></div>
        <button className="new-account-button" onClick={onAdd}>＋ 新增分期</button>
      </div>
      <div className="installment-grid">
        {totalRows ? rows.map((item) => {
          const view = installmentPresentation(item);
          return (
            <article key={item.id}>
              <div className="installment-title"><span>💳</span><div><h3>{item.name}</h3><p>{view.periods} 期 · 手续费 {formatCurrency(item.feeAmount / 100, item.currency)}</p></div><b>{view.percent}%</b></div>
              <div className="amortization-track"><i style={{ width: `${view.percent}%` }} /></div>
              <div className="installment-stats">
                <span>已还 <b>{formatCurrency(view.paidAmount / 100, item.currency)}</b></span>
                <span>剩余 <b>{formatCurrency(view.remainingAmount / 100, item.currency)}</b></span>
                <span>进度 <b>{view.paidPeriods}/{view.periods}期</b></span>
              </div>
              <small>预计 {view.endYear}年{view.endMonth}月无债一身轻</small>
              {item.paidPeriods === 0 && (
                <button
                  type="button"
                  className="delete-button"
                  aria-label={`撤销并删除${item.name}`}
                  title="撤销并删除未开始分期"
                  onClick={() => onDelete(item)}
                >
                  🗑
                </button>
              )}
            </article>
          );
        }) : <div className="installment-empty">当前没有分期项目。保持这份清醒，未来的工资都属于你。</div>}
      </div>
      <CollectionPagination page={page} totalPages={totalPages} totalRows={totalRows} label="分期付款分页" unit="项" onChange={onPageChange} />
    </section>
  );
}
