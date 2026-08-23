"use client";

export type BudgetDialogProps = {
  open: boolean;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  ledgerId: number;
  budget: number;
  pending: boolean;
  onClose: () => void;
  onSubmit: (data: FormData) => void | Promise<void>;
};

export function BudgetDialog({
  open,
  dialogRef,
  ledgerId,
  budget,
  pending,
  onClose,
  onSubmit,
}: BudgetDialogProps) {
  if (!open) return null;
  return (
    <dialog className="expense-dialog budget-dialog" ref={dialogRef} onCancel={onClose}>
      <form action={onSubmit} className="expense-form">
        <button type="button" className="close-button" onClick={onClose} aria-label="关闭预算窗口">×</button>
        <input type="hidden" name="ledgerId" value={ledgerId} />
        <p className="eyebrow">MONTHLY PLAN</p>
        <h2>修改本月预算</h2>
        <label className="amount-field budget-amount-field">
          <span>¥</span>
          <input name="budget" type="number" min="0.01" step="0.01" defaultValue={(budget / 100).toFixed(2)} required />
        </label>
        <button className="submit-button" disabled={pending}>保存预算</button>
      </form>
    </dialog>
  );
}
