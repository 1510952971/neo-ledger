"use client";

import type { RefObject } from "react";
import { CollectionPagination } from "./collection-pagination";
import { subscriptionPresentation } from "./subscription-presentation.js";

export type SubscriptionListItem = {
  id: number;
  name: string;
  amount: number;
  accountId: number;
  cycle: "每月" | "每季" | "每年";
  category: string;
  nextChargeDate: string;
  createdAt: string;
};

const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 });

export function SubscriptionSection({ sectionRef, rows, totalRows, page, totalPages, todayKey, categoryEmoji, onAdd, onEdit, onRemove, onPageChange }: {
  sectionRef: RefObject<HTMLElement | null>;
  rows: SubscriptionListItem[];
  totalRows: number;
  page: number;
  totalPages: number;
  todayKey: string;
  categoryEmoji: (category: string) => string;
  onAdd: () => void;
  onEdit: (item: SubscriptionListItem) => void;
  onRemove: (id: number) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <article className="subscription-section top-subscription module-planning page-scroll-anchor" ref={sectionRef}>
      <div className="section-heading account-heading">
        <div><p className="eyebrow">AUTO PAY</p><h2>我的续费</h2></div>
        <button className="new-account-button" onClick={onAdd}>＋ 添加</button>
      </div>
      <div className="subscription-list">
        {totalRows ? rows.map((item) => {
          const { expiryStatus, dailyCost, statusClass } = subscriptionPresentation(item, todayKey);
          return (
            <article className={statusClass} key={item.id}>
              <span>{categoryEmoji(item.category)}</span>
              <div className="subscription-info"><strong>{item.name}</strong><small>到期 {item.nextChargeDate.replaceAll("-", ".")} · <i>{expiryStatus}</i></small></div>
              <div className="subscription-cost"><b>{money.format(item.amount / 100)}</b><em>{item.cycle} · 约 {money.format(dailyCost / 100)}/天</em></div>
              <div className="subscription-actions">
                <button aria-label={`修改${item.name}`} title="修改续费" onClick={() => onEdit(item)}>✎</button>
                <button aria-label={`删除${item.name}`} title="删除续费" onClick={() => onRemove(item.id)}>×</button>
              </div>
            </article>
          );
        }) : <p className="subscription-empty">暂无固定开销，生活暂时没有自动吸金兽。</p>}
      </div>
      <CollectionPagination page={page} totalPages={totalPages} totalRows={totalRows} label="我的续费分页" unit="项" onChange={onPageChange} />
    </article>
  );
}
