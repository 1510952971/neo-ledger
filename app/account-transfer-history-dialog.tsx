"use client";

import type { RefObject } from "react";

export type AccountTransferHistoryRow = {
  uuid: string;
  kind: string;
  fromAccountName: string | null;
  toAccountName: string | null;
  amount: number;
  currency: string;
  occurredAt: string;
  note: string;
};

type AccountTransferHistoryDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  accountName: string;
  rows: AccountTransferHistoryRow[];
  loading: boolean;
  error: string;
  hideAmounts: boolean;
  formatCurrency: (amount: number, currency: string) => string;
  formatDateTime: (value: string) => string;
  onClose: () => void;
};

export function AccountTransferHistoryDialog({
  dialogRef,
  accountName,
  rows,
  loading,
  error,
  hideAmounts,
  formatCurrency,
  formatDateTime,
  onClose,
}: AccountTransferHistoryDialogProps) {
  return (
    <dialog className="expense-dialog account-transfer-history-dialog" ref={dialogRef} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="expense-form">
        <button type="button" className="close-button" aria-label="关闭转账记录" onClick={onClose}>×</button>
        <p className="eyebrow">ACCOUNT TRANSFERS</p>
        <h2>{accountName} · 转账记录</h2>
        <p className="form-subtitle">一笔转账同时关联转出和转入账户；这里只展示该账户涉及的记录。</p>
        {loading ? (
          <p className="form-subtitle" role="status">正在读取转账记录…</p>
        ) : error ? (
          <p className="form-error" role="alert">{error}</p>
        ) : rows.length === 0 ? (
          <p className="form-subtitle">暂无转账记录。</p>
        ) : (
          <ul className="account-transfer-history-list">
            {rows.map((row) => (
              <li key={row.uuid}>
                <div>
                  <strong>{row.note.trim() || row.kind}</strong>
                  <span>{row.fromAccountName || "外部"} → {row.toAccountName || "外部"}</span>
                  <small>{formatDateTime(row.occurredAt)}</small>
                </div>
                <b>{hideAmounts ? "••••" : formatCurrency(row.amount / 100, row.currency)}</b>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
