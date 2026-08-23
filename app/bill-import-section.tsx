"use client";

import type { ParsedStatementItem } from "./bill-file-parser";
import { statementAccountKey, suggestStatementAccount } from "./bill-import-core.js";
import type { BillImportSummary } from "./bill-import-workflow";

type Currency = "CNY" | "USD" | "JPY" | "EUR";
type ImportedBill = ParsedStatementItem & {
  accountId: number;
  accountName: string;
  importKey: string;
  possibleDuplicate?: boolean;
};
type ImportBatch = {
  id: string;
  sourceLabel: string;
  importedCount: number;
  status: "importing" | "completed" | "failed" | "undoing" | "undone";
  undoStartedAt: string | null;
  undoResumable: boolean | number;
  createdAt: string;
  completedAt: string | null;
  undoneAt: string | null;
};
type AccountOption = { id: number; name: string; type: "资产" | "负债"; currency: Currency; icon: string };

const acceptedFiles = ".xls,.xlsx,.xlsm,.xlsb,.ods,.et,.ett,.csv,.pdf,.jpg,.jpeg,.png,.webp,.bmp,.gif,.html,.htm,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet,application/pdf,image/jpeg,image/png,image/webp,image/bmp,image/gif,text/html,text/csv,text/plain";

export function BillImportSection({
  pending,
  status,
  error,
  items,
  summary,
  batches,
  manualAccountKeys,
  accountActionKey,
  accounts,
  formatCurrency,
  formatTimestamp,
  onClean,
  onParseFiles,
  onUndoBatch,
  onConfirm,
  onCreateAccountAndImport,
  onUseManualAccount,
  onAssignAccount,
  onRemoveItem,
}: {
  pending: boolean;
  status: string;
  error: string;
  items: ImportedBill[];
  summary: BillImportSummary | null;
  batches: ImportBatch[];
  manualAccountKeys: string[];
  accountActionKey: string;
  accounts: AccountOption[];
  formatCurrency: (amount: number, currency: Currency) => string;
  formatTimestamp: (value: string) => string;
  onClean: () => void | Promise<unknown>;
  onParseFiles: (files: FileList | File[] | null | undefined) => void | Promise<unknown>;
  onUndoBatch: (batch: ImportBatch) => void | Promise<unknown>;
  onConfirm: () => void | Promise<unknown>;
  onCreateAccountAndImport: (accountKey: string) => void | Promise<unknown>;
  onUseManualAccount: (accountKey: string) => void;
  onAssignAccount: (accountKey: string, accountId: number) => void;
  onRemoveItem: (index: number) => void;
}) {
  return (
    <section className="email-bill-sandbox">
      <div>
        <p className="eyebrow">STATEMENT DISTILLER</p>
        <h3>📥 全平台账单导入</h3>
        <span>微信、支付宝、美团、京东与银行卡流水自动识别</span>
        <button className="clean-import-button" onClick={() => void onClean()} disabled={pending}>🧹 清理误识别声明账单</button>
      </div>
      <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void onParseFiles(event.dataTransfer.files); }}>
        <strong>{pending ? status || "正在识别平台、字段与重复流水…" : "拖拽账单或多张截图到这里"}</strong>
        <small>支持 Excel / WPS / CSV / PDF / 图片 / HTML / TXT，可一次选择多张截图</small>
        <input type="file" multiple accept={acceptedFiles} onChange={(event) => void onParseFiles(event.target.files)} />
      </label>
      {error && <p className="import-error">{error}</p>}
      {batches.length > 0 && <div className="import-batch-list">
        <strong>最近导入批次</strong>
        {batches.slice(0, 5).map((batch) => <div key={batch.id}>
          <span>{formatTimestamp(batch.createdAt)} · {batch.importedCount} 笔 · {batch.status === "undone" ? "已撤销" : batch.status === "completed" ? "已完成" : batch.status === "failed" ? "部分失败" : batch.status === "undoing" ? "撤销中" : "处理中"}</span>
          {(batch.status === "completed" || batch.status === "failed" || (batch.status === "undoing" && Boolean(batch.undoResumable))) && <button type="button" disabled={pending} onClick={() => void onUndoBatch(batch)}>{batch.status === "undoing" ? "恢复撤销" : "撤销整批"}</button>}
        </div>)}
      </div>}
      {items.length > 0 && <div className="bill-preview">
        <div><div>
          <strong>{summary?.sourceName ?? "账单"} · 待导入 {items.length} 笔</strong>
          {summary && <small>共识别 {summary.detected} 笔{summary.autoImported > 0 && ` · 已自动入账 ${summary.autoImported} 笔`}{summary.pending > 0 && ` · 待处理 ${summary.pending} 笔`}{summary.duplicates > 0 && ` · 已排除 ${summary.duplicates} 笔重复`}{summary.skipped > 0 && ` · 已过滤 ${summary.skipped} 笔中性/无效交易`}</small>}
        </div><button onClick={() => void onConfirm()} disabled={pending || items.some((item) => item.accountId <= 0)}>确认并批量入库</button></div>
        {summary && <div className="import-reconciliation">
          <div className="import-reconciliation-head"><b>导入对账</b><span>源文件总行数 {summary.totalRows}</span><span>成功识别 {summary.ready}</span><span>规则过滤 {summary.filtered}</span><span>无法确认 {summary.unconfirmed}</span><span>截断 {summary.truncated}</span></div>
          {summary.files.map((row) => <div key={row.fileName}><strong>{row.fileName}</strong><span>总行 {row.totalRows}</span><span>成功 {row.success}</span><span>过滤 {row.filtered}</span><span>待确认 {row.unconfirmed}</span><span>截断 {row.truncated}</span></div>)}
        </div>}
        <div className="bill-account-mapping">
          <p>账户识别与导入</p>
          {[...new Map(items.map((item) => [statementAccountKey(item), item])).entries()].map(([accountKey, current]) => {
            const needsChoice = current.accountId <= 0;
            const manual = manualAccountKeys.includes(accountKey);
            if (needsChoice && !manual) {
              const suggestion = suggestStatementAccount(current.paymentMethod, current.sourceName, current.currency) as { name: string; type: "资产" | "负债"; currency: Currency };
              return <div className="bill-account-decision" key={accountKey}><div><strong>{current.paymentMethod}</strong><small>未找到对应账户，建议新建“{suggestion.name}” · {suggestion.type} · {suggestion.currency}</small></div><div>
                <button className="primary" disabled={Boolean(accountActionKey)} onClick={() => void onCreateAccountAndImport(accountKey)}>{accountActionKey === accountKey ? "正在新建并导入…" : "新建账户并导入"}</button>
                <button disabled={Boolean(accountActionKey)} onClick={() => onUseManualAccount(accountKey)}>自主选择账户</button>
              </div></div>;
            }
            return <label key={accountKey}><span>{current.paymentMethod} · {current.currency}</span><select value={current.accountId ?? 0} onChange={(event) => onAssignAccount(accountKey, Number(event.target.value))}><option value={0}>请选择账户</option>{accounts.filter((account) => account.currency === current.currency).map((account) => <option value={account.id} key={account.id}>{account.name} · {account.type}</option>)}</select></label>;
          })}
        </div>
        {summary?.possibleDuplicates ? <p className="import-warning">有 {summary.possibleDuplicates} 笔与现有流水的金额和时间接近，已标记供你复核。</p> : null}
        <div className="bill-card-flow">{items.map((item, index) => <article className={item.possibleDuplicate ? "possible-duplicate" : ""} key={item.importKey || `${item.occurredAt}-${index}`}>
          <span>{item.type === "支出" ? "↗" : "↙"}</span><div><strong>{item.merchant}</strong><small>{item.occurredAt.slice(0, 16)} · {item.paymentMethod} → {item.accountName} · {item.category}</small>{item.possibleDuplicate && <em>可能与已有流水重复</em>}</div><b>{item.type === "支出" ? "-" : "+"}{formatCurrency(item.amount, item.currency)}</b><button aria-label="移除此条" onClick={() => onRemoveItem(index)}>×</button>
        </article>)}</div>
      </div>}
    </section>
  );
}
