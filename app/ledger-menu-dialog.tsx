import type { RefObject } from "react";

type LedgerOption = { id: number; name: string; icon: string };

export function LedgerMenuDialog({
  open,
  dialogRef,
  currentLedgerId,
  ledgers,
  pending,
  onClose,
  onSelect,
  onCreate,
  onDelete,
}: {
  open: boolean;
  dialogRef: RefObject<HTMLDialogElement | null>;
  currentLedgerId: number;
  ledgers: LedgerOption[];
  pending: boolean;
  onClose: () => void;
  onSelect: (ledgerId: number) => void;
  onCreate: () => void | Promise<unknown>;
  onDelete: () => void | Promise<unknown>;
}) {
  if (!open) return null;
  return (
    <dialog className="expense-dialog ledger-menu-dialog" ref={dialogRef} onCancel={onClose}>
      <div className="expense-form">
        <button type="button" className="close-button" onClick={onClose}>×</button>
        <p className="eyebrow">LEDGER SPACE</p>
        <h2>📚 切换账本</h2>
        <label className="title-field ledger-choice">
          <span>当前账本</span>
          <select value={currentLedgerId} onChange={(event) => onSelect(Number(event.target.value))}>
            {ledgers.map((item) => <option value={item.id} key={item.id}>{item.icon} {item.name}</option>)}
          </select>
        </label>
        <div className="ledger-menu-actions">
          <button type="button" onClick={() => void onCreate()}>＋ 新建账本</button>
          <button type="button" className="danger" onClick={() => void onDelete()} disabled={pending || ledgers.length <= 1}>− 删除当前账本</button>
        </div>
        {ledgers.length <= 1 && <small>至少需要保留一个账本。</small>}
      </div>
    </dialog>
  );
}
