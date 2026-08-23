"use client";

import type { RefObject } from "react";
import { CollectionPagination } from "./collection-pagination";
import { categoryBudgetPresentation } from "./category-budget-presentation.js";

export type CategoryBudgetListItem = { category: string; amount: number; updatedAt: string };
const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 });

export function CategoryBudgetSection({ sectionRef, categories, budgets, spend, categoryEmoji, configuredCategoryNames, page, totalPages, totalRows, onCustomize, onEditCategory, onSave, onPageChange }: {
  sectionRef: RefObject<HTMLDivElement | null>;
  categories: string[];
  budgets: CategoryBudgetListItem[];
  spend: Record<string, number>;
  categoryEmoji: (category: string) => string;
  configuredCategoryNames: string[];
  page: number;
  totalPages: number;
  totalRows: number;
  onCustomize: () => void;
  onEditCategory: (category: string) => void;
  onSave: (formData: FormData) => void;
  onPageChange: (page: number) => void;
}) {
  const budgetByCategory = new Map(budgets.map((item) => [item.category, item.amount]));
  const configuredNames = new Set(configuredCategoryNames);
  return (
    <section className="control-grid module-planning">
      <div className="category-budget-section page-scroll-anchor" ref={sectionRef}>
        <div className="section-heading account-heading">
          <div><p className="eyebrow">BUDGET CONTROL</p><h2>品类预算</h2></div>
          <button type="button" className="new-account-button" onClick={onCustomize}>＋ 自定义分类</button>
        </div>
        <div className="category-budget-grid">
          {categories.map((category) => {
            const limit = budgetByCategory.get(category) ?? 0;
            const model = categoryBudgetPresentation(spend[category] ?? 0, limit);
            const configured = configuredNames.has(category);
            return (
              <form action={onSave} className={`category-budget-card ${model.level}`} key={category}>
                <input type="hidden" name="category" value={category} />
                <div>
                  <span>{categoryEmoji(category)} {category}</span>
                  <div>
                    <b>{model.percentage == null ? "未设置" : `${model.percentage}%`}</b>
                    <button type="button" className="category-budget-edit" aria-label={`编辑${category}分类`} title="编辑分类" disabled={!configured} onClick={() => configured && onEditCategory(category)}>编辑</button>
                  </div>
                </div>
                <div className="category-budget-track"><i style={{ width: `${model.progress}%` }} /></div>
                <small>{money.format((spend[category] ?? 0) / 100)} / </small>
                <input name="amount" type="number" min="0" step="1" defaultValue={(limit / 100).toFixed(0)} aria-label={`${category}预算`} />
                <button>保存</button>
                {model.level === "danger" && <p>警报！{category}预算已烧光，请强制开启搬砖模式！</p>}
              </form>
            );
          })}
        </div>
        <CollectionPagination page={page} totalPages={totalPages} totalRows={totalRows} label="品类预算分页" unit="类" onChange={onPageChange} />
      </div>
    </section>
  );
}
