"use client";

import type { RefObject } from "react";

export type AccountSectionAccount = {
  id: number;
  name: string;
  type: "资产" | "负债";
  currentBalance: number;
  billDay: number | null;
  repaymentDay: number | null;
  icon: string;
  isInvestment: boolean;
  initialBalance: number;
  cumulativeIncome: number;
  currency: "CNY" | "USD" | "JPY" | "EUR";
  assetClass: "现金流" | "固收防守" | "风险进攻";
  updatedAt: string;
  createdAt: string;
};

export type AccountRepaymentWarning = { accountId: number; days: number };

type AccountSectionProps = {
  sectionRef?: RefObject<HTMLElement | null>;
  accounts: AccountSectionAccount[];
  warnings: AccountRepaymentWarning[];
  exchangeRates: Record<string, number>;
  formatCurrency: (amount: number, currency: AccountSectionAccount["currency"]) => string;
  formatMoney: (amount: number) => string;
  onTransfer: () => void;
  onAddAccount: () => void;
  onEditAccount: (account: AccountSectionAccount) => void;
};

/** The account portfolio is a presentation boundary; dialogs and mutations stay in the page coordinator. */
export function AccountSection({
  sectionRef,
  accounts,
  warnings,
  exchangeRates,
  formatCurrency,
  formatMoney,
  onTransfer,
  onAddAccount,
  onEditAccount,
}: AccountSectionProps) {
  return (
    <section className="accounts-section module-assets" ref={sectionRef}>
      <div className="section-heading account-heading">
        <div>
          <p className="eyebrow">MONEY POCKETS</p>
          <h2>我的账户</h2>
        </div>
        <div className="account-heading-actions">
          <button className="new-account-button" onClick={onTransfer}>
            ⇄ 账户转账
          </button>
          <button className="new-account-button" onClick={onAddAccount}>
            ＋ 新增账户
          </button>
        </div>
      </div>
      <div className="account-grid">
        {accounts.map((account) => {
          const due = warnings.find((item) => item.accountId === account.id);
          const rate = exchangeRates[account.currency] ?? 1;
          return (
            <button
              type="button"
              className={`account-card ${account.type === "负债" ? "debt" : ""} ${account.isInvestment ? "investment" : ""}`}
              key={account.id}
              onClick={() => onEditAccount(account)}
            >
              <div className="account-icon">{account.icon}</div>
              <div>
                <p>{account.name}</p>
                <strong>
                  {formatCurrency(
                    (account.type === "负债"
                      ? Math.abs(account.currentBalance)
                      : account.currentBalance) / 100,
                    account.currency,
                  )}
                </strong>
                {account.currency !== "CNY" && (
                  <small>
                    {account.currency} · 折合 {formatMoney(
                      (Math.abs(account.currentBalance) * rate) / 100,
                    )}
                  </small>
                )}
              </div>
              {account.isInvestment ? (
                <div className="investment-metrics">
                  <span>累计收益 {formatMoney(account.cumulativeIncome / 100)}</span>
                  <b>
                    模拟年化 {account.initialBalance
                      ? ((account.cumulativeIncome / Math.abs(account.initialBalance)) * 12 * 100).toFixed(2)
                      : "0.00"}%
                  </b>
                </div>
              ) : account.type === "负债" ? (
                <div className={`account-due ${due ? "urgent" : ""}`}>
                  <span>{account.billDay}日账单 · {account.repaymentDay}日还款</span>
                  <b>{due ? `还有 ${due.days} 天还款` : "还款日正常"}</b>
                </div>
              ) : (
                <span>资产账户 · 点击管理</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
