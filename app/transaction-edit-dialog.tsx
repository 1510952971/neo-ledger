"use client";

import type { RefObject } from "react";

export type TransactionEditSectionDraft = {
  transaction: {
    title: string;
    amount: number;
    occurredAt: string;
    currency: string;
    note?: string | null;
    tags?: string[];
    reimbursable?: boolean;
    discountAmount?: number;
    excludeFromBudget?: boolean;
  };
  type: "支出" | "收入";
  accountId: number;
  mood: string;
  category: string;
  incomeCategory: string;
};

type TransactionEditDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  draft: TransactionEditSectionDraft;
  accounts: Array<{ id: number; name: string; currency: string }>;
  categories: string[];
  incomeCategories: string[];
  moods: string[];
  error: string;
  pending: boolean;
  formatDateTime: (value: string) => string;
  onClose: () => void;
  onSubmit: (formData: FormData) => void | Promise<void>;
  onTypeChange: (type: "支出" | "收入") => void;
  onAccountChange: (accountId: number) => void;
  onCategoryChange: (category: string) => void;
  onMoodChange: (mood: string) => void;
  onIncomeCategoryChange: (category: string) => void;
};

/** Transaction edits are a financial mutation surface and keep their form boundary explicit. */
export function TransactionEditDialog({
  dialogRef,
  draft,
  accounts,
  categories,
  incomeCategories,
  moods,
  error,
  pending,
  formatDateTime,
  onClose,
  onSubmit,
  onTypeChange,
  onAccountChange,
  onCategoryChange,
  onMoodChange,
  onIncomeCategoryChange,
}: TransactionEditDialogProps) {
  return (
    <dialog className="expense-dialog transaction-edit-dialog" ref={dialogRef} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <form action={onSubmit} className="expense-form">
        <button type="button" className="close-button" aria-label="关闭修改账单" onClick={onClose}>×</button>
        <p className="eyebrow">EDIT TRANSACTION</p>
        <h2>修改账单</h2>
        <div className="type-switch">
          <button type="button" className={draft.type === "支出" ? "active" : ""} onClick={() => onTypeChange("支出")}>支出</button>
          <button type="button" className={draft.type === "收入" ? "active" : ""} onClick={() => onTypeChange("收入")}>收入</button>
        </div>
        <div className="transaction-edit-grid">
          <label><span>账单名称</span><input name="title" defaultValue={draft.transaction.title} maxLength={40} required /></label>
          <label><span>金额 · {accounts.find((account) => account.id === draft.accountId)?.currency ?? draft.transaction.currency}</span><input name="amount" type="number" min="0.01" step="0.01" defaultValue={(draft.transaction.amount / 100).toFixed(2)} required /></label>
          <label><span>发生时间</span><input name="occurredAt" type="datetime-local" defaultValue={formatDateTime(draft.transaction.occurredAt)} required /></label>
          <label><span>备注</span><input name="note" defaultValue={draft.transaction.note ?? ""} maxLength={240} placeholder="补充用途或上下文" /></label>
          <label><span>标签</span><input name="tags" defaultValue={(draft.transaction.tags ?? []).join("，")} placeholder="多个标签用逗号分隔" /></label>
          <label><span>{draft.type === "支出" ? "扣款账户" : "入账账户"}</span><select value={draft.accountId} onChange={(event) => onAccountChange(Number(event.target.value))}>{accounts.map((account) => <option value={account.id} key={account.id}>{account.name} · {account.currency}</option>)}</select></label>
          {draft.type === "支出" ? <>
            <label><span>消费分类</span><select value={draft.category} onChange={(event) => onCategoryChange(event.target.value)}>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
            <label><span>消费情绪</span><select value={draft.mood} onChange={(event) => onMoodChange(event.target.value)}>{moods.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
          </> : <label className="transaction-edit-wide"><span>收入分类</span><select value={draft.incomeCategory} onChange={(event) => onIncomeCategoryChange(event.target.value)}>{incomeCategories.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>}
        </div>
        <div className="transaction-edit-options">
          <label><span>优惠金额</span><input name="discountAmount" type="number" min="0" step="0.01" defaultValue={((draft.transaction.discountAmount ?? 0) / 100).toFixed(2)} /></label>
          <label className="checkbox-field"><input name="reimbursable" type="checkbox" defaultChecked={draft.transaction.reimbursable === true} /><span>待报销</span></label>
          <label className="checkbox-field"><input name="excludeFromBudget" type="checkbox" defaultChecked={draft.transaction.excludeFromBudget === true} /><span>不计入预算</span></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="submit-button" disabled={pending}>{pending ? "正在校正账户余额…" : "保存修改"}</button>
      </form>
    </dialog>
  );
}
