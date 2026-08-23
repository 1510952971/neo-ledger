"use client";

import type { RefObject } from "react";

type CategoryItem = {
  id: number;
  ledgerId: number;
  name: string;
  icon: string;
  color: string;
  builtinKey: string | null;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
};
type CategoryDialogsProps = {
  incomeOpen: boolean;
  expenseOpen: boolean;
  incomeRef: RefObject<HTMLDialogElement | null>;
  expenseRef: RefObject<HTMLDialogElement | null>;
  incomeCategories: CategoryItem[];
  expenseCategories: CategoryItem[];
  editingIncome: CategoryItem | null;
  editingExpense: CategoryItem | null;
  incomeError: string;
  expenseError: string;
  pending: boolean;
  onCloseIncome: () => void;
  onCloseExpense: () => void;
  onEditIncome: (item: CategoryItem | null) => void;
  onEditExpense: (item: CategoryItem | null) => void;
  onRemoveIncome: (item: CategoryItem) => void | Promise<void>;
  onRestoreIncome: (item: CategoryItem) => void | Promise<void>;
  onRemoveExpense: (item: CategoryItem) => void | Promise<void>;
  onRestoreExpense: (item: CategoryItem) => void | Promise<void>;
  onSaveIncome: (formData: FormData) => void | Promise<void>;
  onSaveExpense: (formData: FormData) => void | Promise<void>;
};

function CategoryList({
  items,
  income,
  onEdit,
  onRemove,
  onRestore,
}: {
  items: CategoryItem[];
  income: boolean;
  onEdit: (item: CategoryItem) => void;
  onRemove: (item: CategoryItem) => void | Promise<void>;
  onRestore: (item: CategoryItem) => void | Promise<void>;
}) {
  return (
    <div className="category-manager-list">
      {items.map((item) => (
        <article className={item.isActive ? "" : "inactive"} key={item.id}>
          <span style={{ background: item.color }}>{item.icon}</span>
          <div>
            <strong>{item.name}</strong>
            <small>
              {item.isSystem
                ? income
                  ? "系统内置 · 仅支持重命名"
                  : "系统内置 · 支持重命名"
                : income
                  ? "自定义收入分类"
                  : "自定义分类"}
              {!item.isActive ? " · 已停用" : ""}
            </small>
          </div>
          {item.isActive ? (
            <>
              <button type="button" onClick={() => onEdit(item)}>重命名</button>
              {(!income || !item.isSystem) && <button type="button" className="category-remove" onClick={() => void onRemove(item)}>移除</button>}
            </>
          ) : <button type="button" onClick={() => void onRestore(item)}>恢复</button>}
        </article>
      ))}
    </div>
  );
}

function CategoryEditor({
  income,
  editing,
  pending,
  onSave,
  onCancel,
}: {
  income: boolean;
  editing: CategoryItem | null;
  pending: boolean;
  onSave: (formData: FormData) => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <form key={editing?.id ?? (income ? "new-income-category" : "new-category")} action={onSave} className="category-editor">
      <div><p className="eyebrow">{editing ? (income ? "RENAME INCOME" : "RENAME CATEGORY") : income ? "NEW INCOME" : "NEW CATEGORY"}</p><strong>{editing ? (income ? "编辑收入分类" : "编辑分类") : income ? "添加收入分类" : "添加新分类"}</strong></div>
      <label><span>图标</span><input name="icon" defaultValue={editing?.icon ?? (income ? "💰" : "📦")} maxLength={8} required /></label>
      <label><span>名称</span><input name="name" defaultValue={editing?.name ?? ""} placeholder={income ? "如：稿费" : "如：宠物"} maxLength={12} required /></label>
      <label><span>主题色</span><input name="color" type="color" defaultValue={editing?.color ?? (income ? "#78a98c" : "#8f91b8")} /></label>
      <button disabled={pending}>{editing ? "保存修改" : "添加分类"}</button>
      {editing && <button type="button" className="cancel-category-edit" onClick={onCancel}>取消</button>}
    </form>
  );
}

/** Expense and income category management stays presentation-only. */
export function CategoryDialogs({
  incomeOpen,
  expenseOpen,
  incomeRef,
  expenseRef,
  incomeCategories,
  expenseCategories,
  editingIncome,
  editingExpense,
  incomeError,
  expenseError,
  pending,
  onCloseIncome,
  onCloseExpense,
  onEditIncome,
  onEditExpense,
  onRemoveIncome,
  onRestoreIncome,
  onRemoveExpense,
  onRestoreExpense,
  onSaveIncome,
  onSaveExpense,
}: CategoryDialogsProps) {
  return (
    <>
      {incomeOpen && <dialog className="expense-dialog category-manager-dialog" ref={incomeRef} onCancel={onCloseIncome}><div className="expense-form"><button type="button" className="close-button" onClick={onCloseIncome}>×</button><p className="eyebrow">INCOME CATEGORY STUDIO</p><h2>收入分类工作室</h2><p className="form-subtitle">内置收入分类只支持重命名；自定义分类可自由添加和删减。</p><CategoryList items={incomeCategories} income onEdit={onEditIncome} onRemove={onRemoveIncome} onRestore={onRestoreIncome} /><CategoryEditor income editing={editingIncome} pending={pending} onSave={onSaveIncome} onCancel={() => onEditIncome(null)} />{incomeError && <p className="account-error">{incomeError}</p>}</div></dialog>}
      {expenseOpen && <dialog className="expense-dialog category-manager-dialog" ref={expenseRef} onCancel={onCloseExpense}><div className="expense-form"><button type="button" className="close-button" onClick={onCloseExpense}>×</button><p className="eyebrow">CATEGORY STUDIO</p><h2>消费分类工作室</h2><p className="form-subtitle">内置分类可以改名；移除采用安全停用，历史账单与统计不会丢失。</p><CategoryList items={expenseCategories} income={false} onEdit={onEditExpense} onRemove={onRemoveExpense} onRestore={onRestoreExpense} /><CategoryEditor income={false} editing={editingExpense} pending={pending} onSave={onSaveExpense} onCancel={() => onEditExpense(null)} />{expenseError && <p className="account-error">{expenseError}</p>}</div></dialog>}
    </>
  );
}
