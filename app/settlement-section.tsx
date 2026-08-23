"use client";

import type { RefObject } from "react";
import { CollectionPagination } from "./collection-pagination";
import { settlementPresentation } from "./settlement-presentation.js";

export type SettlementMember = { id: number; name: string; icon: string; isMe: boolean };
const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 });

export function SettlementSection({ sectionRef, currentMembers, pageMembers, settlements, page, totalPages, totalRows, pending, onAdd, onSettle, onPageChange }: {
  sectionRef: RefObject<HTMLElement | null>;
  currentMembers: SettlementMember[];
  pageMembers: SettlementMember[];
  settlements: Array<{ member: SettlementMember; balance: number }>;
  page: number;
  totalPages: number;
  totalRows: number;
  pending: boolean;
  onAdd: () => void;
  onSettle: (memberId: number, balance: number) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <section className="settlement-section module-planning page-scroll-anchor" ref={sectionRef}>
      <div className="section-heading account-heading">
        <div><p className="eyebrow">SPLIT &amp; SETTLE</p><h2>分账搭子</h2></div>
        <button className="new-account-button" onClick={onAdd}>＋ 添加成员</button>
      </div>
      <div className="member-chips">
        {currentMembers.map((item) => <span key={item.id}>{item.icon} {item.name} · 本人</span>)}
        {pageMembers.map((item) => <span key={item.id}>{item.icon} {item.name}</span>)}
      </div>
      <div className="settlement-grid">
        {settlements.length ? settlements.map(({ member, balance }) => {
          const model = settlementPresentation(balance, member.name);
          return (
            <article className={model.className} key={member.id}>
              <div><span>{member.icon}</span><p>{model.message}</p></div>
              <strong>{money.format(model.amount / 100)}</strong>
              <button onClick={() => onSettle(member.id, balance)} disabled={pending}>一键清算 / 平账</button>
            </article>
          );
        }) : (
          <article className="settled"><div><span>🤝</span><p>当前人情往来已全部清爽平账</p></div><strong>¥0.00</strong></article>
        )}
      </div>
      <CollectionPagination page={page} totalPages={totalPages} totalRows={totalRows} label="分账搭子分页" unit="人" onChange={onPageChange} />
    </section>
  );
}
