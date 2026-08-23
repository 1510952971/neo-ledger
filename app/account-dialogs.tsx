"use client";

import type { RefObject } from "react";

type AccountDialogAccount = {
  id: number;
  name: string;
  type: "资产" | "负债";
  currentBalance: number;
  currency: "CNY" | "USD" | "JPY" | "EUR";
  icon: string;
  assetClass: "现金流" | "固收防守" | "风险进攻";
  isInvestment: boolean;
  updatedAt: string;
  billDay: number | null;
  repaymentDay: number | null;
};

type EditingAccount = AccountDialogAccount | null;

type AccountDialogsProps = {
  transferOpen: boolean;
  accountOpen: boolean;
  transferRef: RefObject<HTMLDialogElement | null>;
  accountRef: RefObject<HTMLDialogElement | null>;
  accountList: AccountDialogAccount[];
  editingAccount: EditingAccount;
  accountType: "资产" | "负债";
  transferError: string;
  accountError: string;
  pending: boolean;
  formatCurrency: (amount: number, currency: AccountDialogAccount["currency"]) => string;
  submitTransfer: (formData: FormData) => void | Promise<void>;
  submitAccount: (formData: FormData) => void | Promise<void>;
  onCloseTransfer: () => void;
  onCloseAccount: () => void;
  onAccountTypeChange: (value: "资产" | "负债") => void;
  onRemoveAccount: () => void;
};

/** Account and transfer forms stay presentational; writes remain in the action coordinator. */
export function AccountDialogs({
  transferOpen,
  accountOpen,
  transferRef,
  accountRef,
  accountList,
  editingAccount,
  accountType,
  transferError,
  accountError,
  pending,
  formatCurrency,
  submitTransfer,
  submitAccount,
  onCloseTransfer,
  onCloseAccount,
  onAccountTypeChange,
  onRemoveAccount,
}: AccountDialogsProps) {
  return (
    <>
      {transferOpen && (
        <dialog
          className="expense-dialog account-dialog"
          ref={transferRef}
          onCancel={onCloseTransfer}
        >
          <form action={submitTransfer} className="expense-form">
            <button type="button" className="close-button" onClick={onCloseTransfer}>
              ×
            </button>
            <p className="eyebrow">ACCOUNT TRANSFER</p>
            <h2>账户转账 / 信用卡还款</h2>
            <p className="form-subtitle">转入负债账户时会同时扣减资产并冲减欠款。</p>
            <label className="title-field">
              <span>转出资产账户</span>
              <select name="fromAccountId" required>
                {accountList.filter((item) => item.type === "资产").map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.icon} {item.name} · {formatCurrency(item.currentBalance / 100, item.currency)}
                  </option>
                ))}
              </select>
            </label>
            <label className="title-field">
              <span>转入账户</span>
              <select name="toAccountId" required>
                {accountList.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.icon} {item.name} · {item.type} · {item.currency}
                  </option>
                ))}
              </select>
            </label>
            <label className="title-field">
              <span>金额</span>
              <input name="amount" type="number" min="0.01" step="0.01" required />
            </label>
            <label className="title-field">
              <span>备注</span>
              <input name="note" maxLength={120} placeholder="可选" />
            </label>
            {transferError && <p className="account-error">{transferError}</p>}
            <button className="submit-button" disabled={pending}>确认转账</button>
          </form>
        </dialog>
      )}

      {accountOpen && (
        <dialog
          className="expense-dialog account-dialog"
          ref={accountRef}
          onCancel={onCloseAccount}
        >
          <form key={editingAccount?.id ?? "new"} action={submitAccount} className="expense-form">
            <button type="button" className="close-button" onClick={onCloseAccount}>
              ×
            </button>
            <p className="eyebrow">ACCOUNT MANAGER</p>
            <h2>{editingAccount ? "编辑账户" : "新增账户"}</h2>
            <p className="form-subtitle">账户数据将实时保存到本地 SQLite。</p>
            <label className="title-field">
              <span>账户名称</span>
              <input name="name" defaultValue={editingAccount?.name ?? ""} placeholder="如：建设银行卡" maxLength={30} required />
            </label>
            <label className="title-field">
              <span>账户本币</span>
              <select name="currency" defaultValue={editingAccount?.currency ?? "CNY"}>
                <option value="CNY">🇨🇳 CNY · 人民币</option>
                <option value="USD">🇺🇸 USD · 美元</option>
                <option value="JPY">🇯🇵 JPY · 日元</option>
                <option value="EUR">🇪🇺 EUR · 欧元</option>
              </select>
            </label>
            {accountType === "资产" && (
              <label className="title-field">
                <span>资产属性</span>
                <select name="assetClass" defaultValue={editingAccount?.assetClass ?? (editingAccount?.isInvestment ? "风险进攻" : "现金流")}>
                  <option value="现金流">💧 现金流 · 微信/支付宝/活期</option>
                  <option value="固收防守">🛡️ 固收防守 · 存款/债券</option>
                  <option value="风险进攻">🚀 风险进攻 · 基金/股票/理财</option>
                </select>
              </label>
            )}
            <fieldset>
              <legend>账户类型</legend>
              <div className="account-type-switch">
                <button type="button" className={accountType === "资产" ? "active" : ""} onClick={() => onAccountTypeChange("资产")}>
                  资产账户<small>现金 / 钱包 / 银行卡 / 理财</small>
                </button>
                <button type="button" className={accountType === "负债" ? "active" : ""} onClick={() => onAccountTypeChange("负债")}>
                  负债账户<small>信用卡 / 花呗 / 白条</small>
                </button>
              </div>
            </fieldset>
            <label className="title-field">
              <span>{accountType === "负债" ? "当前欠款金额" : "当前账户余额"}</span>
              <input
                className="financial-input"
                name="balance"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editingAccount ? (Math.abs(editingAccount.currentBalance) / 100).toFixed(2) : "0.00"}
                required
              />
            </label>
            {accountType === "负债" ? (
              <div className="two-fields">
                <label className="title-field">
                  <span>每月账单日</span>
                  <input name="billDay" type="number" min="1" max="31" defaultValue={editingAccount?.billDay ?? 1} required />
                </label>
                <label className="title-field">
                  <span>每月还款日</span>
                  <input name="repaymentDay" type="number" min="1" max="31" defaultValue={editingAccount?.repaymentDay ?? 10} required />
                </label>
              </div>
            ) : (
              <label className="investment-check">
                <input name="isInvestment" type="checkbox" defaultChecked={editingAccount?.isInvestment ?? false} />
                <span>这是投资理财账户，需要追踪收益率</span>
              </label>
            )}
            {accountError && <p className="account-error">{accountError}</p>}
            <div className="account-form-actions">
              {editingAccount && (
                <button type="button" className="danger-button" onClick={onRemoveAccount} disabled={pending}>
                  删除 / 注销账户
                </button>
              )}
              <button className="submit-button" disabled={pending}>
                {pending ? "正在保存…" : "保存账户"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
