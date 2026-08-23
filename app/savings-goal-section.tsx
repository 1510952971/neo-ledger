"use client";

import type { RefObject } from "react";
import { CollectionPagination } from "./collection-pagination";
import { savingsGoalPresentation } from "./savings-goal-presentation.js";

export type SavingsGoalListItem = { id: number; ledgerId: number; name: string; targetAmount: number; savedAmount: number; deadline: string; icon: string; updatedAt: string; createdAt: string };
const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 });

export function SavingsGoalSection({ sectionRef, rows, totalRows, page, totalPages, todayKey, onAdd, onManage, onPageChange }: {
  sectionRef: RefObject<HTMLElement | null>;
  rows: SavingsGoalListItem[];
  totalRows: number;
  page: number;
  totalPages: number;
  todayKey: string;
  onAdd: () => void;
  onManage: (goal: SavingsGoalListItem) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <section className="goals-section module-planning page-scroll-anchor" ref={sectionRef}>
      <div className="section-heading account-heading">
        <div><p className="eyebrow">DREAM VAULT</p><h2>心愿储蓄罐</h2></div>
        <button className="new-account-button" onClick={onAdd}>＋ 新心愿</button>
      </div>
      <div className="goal-grid">
        {totalRows ? rows.map((goal) => {
          const { percent, completed, overdue } = savingsGoalPresentation(goal, todayKey);
          return (
            <article className={`goal-card ${completed ? "completed" : ""} ${overdue && !completed ? "overdue" : ""}`} key={goal.id}>
              {completed && <div className="fireworks">✦ ✧ ✦</div>}
              <div className="goal-orb"><span>{goal.icon}</span><i style={{ height: `${percent}%` }} /></div>
              <div>
                <h3>{goal.name}</h3>
                <p>{money.format(goal.savedAmount / 100)} / {money.format(goal.targetAmount / 100)}</p>
                <div className="goal-track"><i style={{ width: `${percent}%` }} /></div>
                <small>{percent}% · 截止 {goal.deadline}</small>
              </div>
              <button onClick={() => onManage(goal)}>{completed ? "管理" : "存一笔"}</button>
            </article>
          );
        }) : <p className="subscription-empty">还没有心愿。给未来的快乐先留一个位置吧。</p>}
      </div>
      <CollectionPagination page={page} totalPages={totalPages} totalRows={totalRows} label="心愿储蓄罐分页" unit="个" onChange={onPageChange} />
    </section>
  );
}
