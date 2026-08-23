import type { RefObject } from "react";
import type { PendingFlow, SystemNotice } from "./notification-actions";
import { PendingTransactionSection } from "./pending-transaction-section";

type Props = {
  open: boolean;
  dialogRef: RefObject<HTMLDialogElement | null>;
  currentLedgerId: number;
  notices: SystemNotice[];
  pendingFlows: PendingFlow[];
  pendingTotal: number;
  categories: string[];
  categoryMeta: Record<string, { emoji: string }>;
  formatCurrency: (amount: number, currency: PendingFlow["currency"]) => string;
  onClose: () => void;
  onRefreshPending: () => void | Promise<void>;
  onProcessPending: (id: number, category?: string, action?: "confirm" | "ignore") => void;
};

export function NotificationDialog({
  open,
  dialogRef,
  currentLedgerId,
  notices,
  pendingFlows,
  pendingTotal,
  categories,
  categoryMeta,
  formatCurrency,
  onClose,
  onRefreshPending,
  onProcessPending,
}: Props) {
  if (!open) return null;
  return (
    <dialog className="expense-dialog notice-dialog" ref={dialogRef} onCancel={onClose}>
      <div className="expense-form">
        <button type="button" className="close-button" onClick={onClose}>×</button>
        <p className="eyebrow">SYSTEM INBOX</p>
        <h2>🔔 系统通知</h2>
        <p className="form-subtitle">自动流水提醒与待确认任务集中在这里。</p>
        <section className="notice-center">
          <div><strong>最新通知</strong><span>{notices.length} 条</span></div>
          {notices.length ? notices.slice(0, 10).map((item) => (
            <article key={item.id}>
              <div><strong>{item.title}</strong><small>{item.createdAt}</small></div>
              <p>{item.message}</p>
            </article>
          )) : <p className="pipeline-empty">目前没有新的系统通知。</p>}
        </section>
        <section className="automation-pipeline">
          <div>
            <p className="eyebrow">BARK / SMS AUTOMATION</p>
            <h3>📲 自动化流水线</h3>
            <span>POST /api/v1/webhook/auto-parse · Bearer 集成令牌</span>
          </div>
          <pre>{`POST /api/v1/webhook/auto-parse\nAuthorization: Bearer $INTEGRATION_TOKEN\nIdempotency-Key: bank-message-unique-id\nContent-Type: application/json\n\n{"text":"【招商银行】您账户0422于07/11 22:15消费支出人民币15.00元。","ledgerId":${currentLedgerId}}`}</pre>
          <PendingTransactionSection
            rows={pendingFlows}
            total={pendingTotal}
            categories={categories}
            categoryMeta={categoryMeta}
            formatCurrency={formatCurrency}
            onRefresh={onRefreshPending}
            onProcess={onProcessPending}
          />
        </section>
      </div>
    </dialog>
  );
}
