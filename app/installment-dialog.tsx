"use client";

import type { RefObject } from "react";

type InstallmentAccount = {
  id: number;
  type: string;
  icon: string;
  name: string;
  currency: string;
};

export type InstallmentDialogProps = {
  open: boolean;
  dialogRef: RefObject<HTMLDialogElement | null>;
  accountList: InstallmentAccount[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (data: FormData) => void | Promise<void>;
};

export function InstallmentDialog({
  open,
  dialogRef,
  accountList,
  pending,
  onClose,
  onSubmit,
}: InstallmentDialogProps) {
  if (!open) return null;
  return (
    <dialog className="expense-dialog account-dialog" ref={dialogRef} onCancel={onClose}>
      <form action={onSubmit} className="expense-form">
        <button type="button" className="close-button" onClick={onClose} aria-label="关闭分期窗口">×</button>
        <p className="eyebrow">AMORTIZATION ENGINE</p>
        <h2>新增大件分期</h2>
        <label className="title-field"><span>大件名称</span><input name="name" placeholder="如：iPhone 16 Pro" required /></label>
        <div className="two-fields">
          <label className="title-field"><span>总金额</span><input name="totalAmount" type="number" min="0.01" step="0.01" required /></label>
          <label className="title-field"><span>手续费 / 利息</span><input name="feeAmount" type="number" min="0" step="0.01" defaultValue="0" /></label>
        </div>
        <div className="two-fields">
          <label className="title-field"><span>总期数</span><select name="periods" defaultValue="12"><option value="3">3期</option><option value="6">6期</option><option value="12">12期</option><option value="24">24期</option><option value="36">36期</option></select></label>
          <label className="title-field"><span>每月扣款日</span><input name="chargeDay" type="number" min="1" max="31" defaultValue="1" required /></label>
        </div>
        <label className="title-field"><span>开始月份</span><input name="startMonth" type="month" required /></label>
        <label className="title-field"><span>分期负债账户</span><select name="accountId">{accountList.filter((item) => item.type === "负债").map((item) => <option value={item.id} key={item.id}>{item.icon} {item.name} · {item.currency}</option>)}</select></label>
        <label className="title-field"><span>每月还款账户</span><select name="paymentAccountId">{accountList.filter((item) => item.type === "资产").map((item) => <option value={item.id} key={item.id}>{item.icon} {item.name} · {item.currency}</option>)}</select></label>
        <button className="submit-button" disabled={pending}>启动自动摊销</button>
      </form>
    </dialog>
  );
}
