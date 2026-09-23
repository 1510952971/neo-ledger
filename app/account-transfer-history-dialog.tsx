"use client";

import { Fragment, useState, type FormEvent, type RefObject } from "react";

export type AccountTransferHistoryRow = {
  uuid: string;
  ledgerId: number;
  kind: string;
  fromAccountId: number | null;
  fromAccountName: string | null;
  toAccountId: number | null;
  toAccountName: string | null;
  amount: number;
  currency: string;
  targetType: string | null;
  occurredAt: string;
  originalTimezone: string;
  note: string;
  updatedAt: string;
};

export type AccountTransferEditAccount = {
  id: number;
  name: string;
  type: "资产" | "负债";
  currency: string;
  isActive: boolean;
};

export type AccountTransferEditValues = {
  kind: "账户转账" | "信用卡还款";
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  occurredAt: string;
  originalTimezone: string;
  note: string;
};

type AccountTransferHistoryDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  accountName: string;
  rows: AccountTransferHistoryRow[];
  loading: boolean;
  error: string;
  hideAmounts: boolean;
  accounts: AccountTransferEditAccount[];
  formatCurrency: (amount: number, currency: string) => string;
  formatDateTime: (value: string) => string;
  onSave: (row: AccountTransferHistoryRow, values: AccountTransferEditValues) => Promise<void>;
  onDelete: (row: AccountTransferHistoryRow) => Promise<void>;
  onClose: () => void;
};

function localDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function TransferEditor({
  row,
  accounts,
  onCancel,
  onSave,
}: {
  row: AccountTransferHistoryRow;
  accounts: AccountTransferEditAccount[];
  onCancel: () => void;
  onSave: (values: AccountTransferEditValues) => Promise<void>;
}) {
  const [kind, setKind] = useState<"账户转账" | "信用卡还款">(row.kind === "信用卡还款" ? "信用卡还款" : "账户转账");
  const [fromAccountId, setFromAccountId] = useState(row.fromAccountId ?? 0);
  const [toAccountId, setToAccountId] = useState(row.toAccountId ?? 0);
  const [amount, setAmount] = useState(String(row.amount / 100));
  const [occurredAt, setOccurredAt] = useState(localDateTime(row.occurredAt));
  const [note, setNote] = useState(row.note);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fromOptions = accounts.filter((account) => account.currency === row.currency && account.type === "资产" && (account.isActive || account.id === row.fromAccountId));
  const toType = kind === "账户转账" ? "资产" : "负债";
  const toOptions = accounts.filter((account) => account.currency === row.currency && account.type === toType && (account.isActive || account.id === row.toAccountId));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("请输入大于 0 的金额");
      return;
    }
    if (!occurredAt || !fromAccountId || !toAccountId || fromAccountId === toAccountId) {
      setError("请检查转账时间和账户选择");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        kind,
        fromAccountId,
        toAccountId,
        amount: parsedAmount,
        occurredAt,
        originalTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || row.originalTimezone || "Asia/Shanghai",
        note: note.trim(),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存转账失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="account-transfer-editor" onSubmit={submit}>
      <label>类型<select value={kind} onChange={(event) => { const nextKind = event.target.value as "账户转账" | "信用卡还款"; setKind(nextKind); const validToType = nextKind === "账户转账" ? "资产" : "负债"; if (!accounts.some((account) => account.id === toAccountId && account.type === validToType && account.currency === row.currency && (account.isActive || account.id === row.toAccountId))) { setToAccountId(accounts.find((account) => account.type === validToType && account.currency === row.currency && account.isActive)?.id ?? 0); } }}><option>账户转账</option><option>信用卡还款</option></select></label>
      <label>转出账户<select value={fromAccountId} onChange={(event) => setFromAccountId(Number(event.target.value))}>{fromOptions.map((account) => <option key={account.id} value={account.id}>{account.name}{account.isActive ? "" : "（已停用）"}</option>)}</select></label>
      <label>转入账户<select value={toAccountId} onChange={(event) => setToAccountId(Number(event.target.value))}>{toOptions.map((account) => <option key={account.id} value={account.id}>{account.name}{account.isActive ? "" : "（已停用）"}</option>)}</select></label>
      <label>金额<input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
      <label>时间<input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} required /></label>
      <label>备注<input maxLength={120} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="account-transfer-editor-actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>取消</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "保存中…" : "保存修改"}</button></div>
    </form>
  );
}

export function AccountTransferHistoryDialog({
  dialogRef,
  accountName,
  rows,
  loading,
  error,
  hideAmounts,
  accounts,
  formatCurrency,
  formatDateTime,
  onSave,
  onDelete,
  onClose,
}: AccountTransferHistoryDialogProps) {
  const [editing, setEditing] = useState<string | null>(null);
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
              <Fragment key={row.uuid}>
                <li>
                  <div>
                    <strong>{row.note.trim() || row.kind}</strong>
                    <span>{row.fromAccountName || "外部"} → {row.toAccountName || "外部"}</span>
                    <small>{formatDateTime(row.occurredAt)}</small>
                  </div>
                  <b>{hideAmounts ? "••••" : formatCurrency(row.amount / 100, row.currency)}</b>
                  {row.targetType == null && ["账户转账", "信用卡还款"].includes(row.kind) && row.fromAccountId != null && row.toAccountId != null && <div className="account-transfer-actions"><button type="button" className="secondary-button" onClick={() => setEditing((active) => active === row.uuid ? null : row.uuid)}>编辑</button><button type="button" className="danger-button" onClick={() => void onDelete(row)}>删除</button></div>}
                </li>
                {editing === row.uuid && <li className="account-transfer-editor-row"><TransferEditor row={row} accounts={accounts} onCancel={() => setEditing(null)} onSave={async (values) => { await onSave(row, values); setEditing(null); }} /></li>}
              </Fragment>
              ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
