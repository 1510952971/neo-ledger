import type { RefObject } from "react";
import type { ParsedStatementItem } from "./bill-file-parser";
import type { BillImportSummary } from "./bill-import-workflow";
import type { WebdavConfig, WebdavSession } from "./browser-settings-state";
import type { NearbyDownload, NearbyPackage, NearbyPeer } from "./nearby-sync-state";
import type { QuickSyncStatus } from "./quick-sync-state";
import type { RestoreSnapshot, SyncConflictReport } from "./data-center-restore-state";
import type { RestoreSummary } from "./restore-result-state";
import type { AppUpdateInfo } from "./app-update-control";
import { AppUpdateSection } from "./app-update-section";
import { BillImportSection } from "./bill-import-section";
import { NearbySyncSection } from "./nearby-sync-section";
import { WebdavSyncSection } from "./webdav-sync-section";
import { QuickSyncSection } from "./quick-sync-section";

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

type RestoreModel = {
  summary: RestoreSummary | null;
  snapshots: RestoreSnapshot[];
  onDismiss: () => void;
  onRestoreFile: (file: File | undefined) => void | Promise<unknown>;
  onRestoreSnapshot: (snapshot: RestoreSnapshot) => void | Promise<unknown>;
};
type PrivacyLockModel = {
  enabled: boolean;
  pending: boolean;
  onSubmit: (formData: FormData) => void | Promise<void>;
};
type BillImportModel = {
  status: string;
  error: string;
  items: ImportedBill[];
  summary: BillImportSummary | null;
  batches: ImportBatch[];
  manualAccountKeys: string[];
  accountActionKey: string;
  accounts: AccountOption[];
  formatCurrency: (amount: number, currency: Currency) => string;
  onClean: () => void | Promise<unknown>;
  onParseFiles: (files: FileList | File[] | null | undefined) => void | Promise<unknown>;
  onUndoBatch: (batch: ImportBatch) => void | Promise<unknown>;
  onConfirm: () => void | Promise<unknown>;
  onCreateAccountAndImport: (accountKey: string) => void | Promise<unknown>;
  onUseManualAccount: (accountKey: string) => void;
  onAssignAccount: (accountKey: string, accountId: number) => void;
  onRemoveItem: (index: number) => void;
};
type NearbyModel = {
  accessUrl: string;
  pairingCode: string;
  receiveCode: string;
  download: NearbyDownload | null;
  packages: NearbyPackage[];
  packageId: string;
  uploading: boolean;
  peers: NearbyPeer[];
  status: string;
  onCopy: (value: string) => void | Promise<unknown>;
  onStatus: (value: string) => void;
  onRefreshAddress: () => void;
  onCreatePackage: () => void | Promise<unknown>;
  onDownloadPackage: () => void;
  onUploadPackage: () => void | Promise<unknown>;
  onReceiveCodeChange: (value: string) => void;
  onReceivePackage: (id: string) => void;
};
type WebdavModel = {
  config: WebdavConfig;
  session: WebdavSession;
  mode: string | null;
  syncing: boolean;
  status: string;
  onConfigChange: (patch: Partial<WebdavConfig>) => void;
  onSessionChange: (patch: Partial<WebdavSession>) => void;
  onPreset: () => void;
  onSync: (formData: FormData) => void | Promise<void>;
};
type QuickSyncModel = {
  accessUrl: string;
  ledgerId: number;
  status: QuickSyncStatus | null;
  token: string;
  message: string;
  label: string;
  expiryDays: number;
  formatTimestamp: (value: string) => string;
  onLabelChange: (value: string) => void;
  onExpiryChange: (value: number) => void;
  onCopyToken: () => void | Promise<unknown>;
  onCopyAddress: () => void | Promise<unknown>;
  onTest: () => void | Promise<unknown>;
  onCopyAndroidConfig: () => void | Promise<unknown>;
  onCreateAndCopyAndroidConfig: () => void | Promise<unknown>;
  onCopyExample: () => void | Promise<unknown>;
  onCopyTemplate: (kind: "shortcut" | "notification") => void | Promise<unknown>;
  onCreate: () => void;
  onRevoke: () => void | Promise<unknown>;
};

export function DataCenterDialog({
  open,
  dialogRef,
  pending,
  onClose,
  restore,
  privacyLock,
  update,
  billImport,
  nearby,
  webdav,
  conflictReport,
  quickSync,
}: {
  open: boolean;
  dialogRef: RefObject<HTMLDialogElement | null>;
  pending: boolean;
  onClose: () => void;
  restore: RestoreModel;
  privacyLock: PrivacyLockModel;
  update: {
    info: AppUpdateInfo | null;
    checking: boolean;
    applying: boolean;
    error: string;
    onCheck: () => void | Promise<unknown>;
    onApply: () => void | Promise<unknown>;
  };
  billImport: BillImportModel;
  nearby: NearbyModel;
  webdav: WebdavModel;
  conflictReport: {
    report: SyncConflictReport | null;
    label: (row: Record<string, unknown>) => string;
    formatTimestamp: (value: string) => string;
  };
  quickSync: QuickSyncModel;
}) {
  if (!open) return null;
  const { report, label, formatTimestamp } = conflictReport;
  return (
    <dialog className="expense-dialog data-dialog" ref={dialogRef} onCancel={onClose}>
      <div className="expense-form">
        <button type="button" className="close-button" onClick={onClose}>×</button>
        <p className="eyebrow">DATA VAULT</p>
        <h2>💾 数据中心</h2>
        <p className="form-subtitle">你的账本属于你。随时导出、备份和迁移。</p>
        <div className="data-actions">
          <a href="/api/data/export?format=csv">📊 导出为 Excel (CSV)<small>历史收支、分类与账户流水</small></a>
          <a href="/api/data/export?format=json">🔒 备份全量数据 (JSON)<small>账户、账单、预算与自动扣款</small></a>
          <label>
            📂 恢复 JSON 备份<small>将覆盖当前数据库，请谨慎操作</small>
            <input type="file" accept="application/json,.json" onChange={(event) => void restore.onRestoreFile(event.target.files?.[0])} />
          </label>
        </div>
        {restore.summary && (
          <div className="restore-result" role="status" aria-live="polite">
            <div>
              <strong>最近一次恢复已完成</strong>
              <span>
                已恢复 {restore.summary.totalRecords} 条数据
                {restore.summary.skippedRecords > 0 ? `，跳过 ${restore.summary.skippedRecords} 条` : ""}
                {restore.summary.errorCount > 0 ? `，${restore.summary.errorCount} 条异常` : ""}
              </span>
            </div>
            <button type="button" onClick={restore.onDismiss}>知道了</button>
          </div>
        )}
        {restore.snapshots.length > 0 && (
          <section className="restore-snapshot-list">
            <h3>恢复前快照</h3>
            <p className="form-subtitle">每次覆盖恢复前自动保留，最多保留最近 3 份。</p>
            {restore.snapshots.map((snapshot) => (
              <div className="restore-snapshot-row" key={snapshot.id}>
                <span>{new Date(snapshot.createdAt).toLocaleString("zh-CN")} · {(snapshot.totalBytes / 1024).toFixed(0)} KB</span>
                <button type="button" onClick={() => void restore.onRestoreSnapshot(snapshot)} disabled={pending}>回滚到此版本</button>
              </div>
            ))}
          </section>
        )}
        <form action={privacyLock.onSubmit} className="privacy-setting">
          <label><input type="checkbox" name="enabled" defaultChecked={privacyLock.enabled} /><span>开启屏幕隐私锁</span></label>
          <input name="pin" type="password" inputMode="numeric" maxLength={4} pattern="\d{4}" placeholder="设置4位数字 PIN（仅防窥屏）" />
          <button disabled={pending || privacyLock.pending}>保存隐私设置</button>
        </form>
        <AppUpdateSection
          info={update.info}
          checking={update.checking}
          applying={update.applying}
          error={update.error}
          onCheck={update.onCheck}
          onApply={update.onApply}
        />
        <BillImportSection
          pending={pending}
          status={billImport.status}
          error={billImport.error}
          items={billImport.items}
          summary={billImport.summary}
          batches={billImport.batches}
          manualAccountKeys={billImport.manualAccountKeys}
          accountActionKey={billImport.accountActionKey}
          accounts={billImport.accounts}
          formatCurrency={billImport.formatCurrency}
          formatTimestamp={conflictReport.formatTimestamp}
          onClean={billImport.onClean}
          onParseFiles={billImport.onParseFiles}
          onUndoBatch={billImport.onUndoBatch}
          onConfirm={billImport.onConfirm}
          onCreateAccountAndImport={billImport.onCreateAccountAndImport}
          onUseManualAccount={billImport.onUseManualAccount}
          onAssignAccount={billImport.onAssignAccount}
          onRemoveItem={billImport.onRemoveItem}
        />
        <NearbySyncSection
          accessUrl={nearby.accessUrl}
          pairingCode={nearby.pairingCode}
          receiveCode={nearby.receiveCode}
          download={nearby.download}
          packages={nearby.packages}
          packageId={nearby.packageId}
          uploading={nearby.uploading}
          peers={nearby.peers}
          status={nearby.status}
          pending={pending}
          onCopy={nearby.onCopy}
          onStatus={nearby.onStatus}
          onRefreshAddress={nearby.onRefreshAddress}
          onCreatePackage={nearby.onCreatePackage}
          onDownloadPackage={nearby.onDownloadPackage}
          onUploadPackage={nearby.onUploadPackage}
          onReceiveCodeChange={nearby.onReceiveCodeChange}
          onReceivePackage={nearby.onReceivePackage}
        />
        <WebdavSyncSection
          config={webdav.config}
          session={webdav.session}
          mode={webdav.mode}
          syncing={webdav.syncing}
          status={webdav.status}
          onConfigChange={webdav.onConfigChange}
          onSessionChange={webdav.onSessionChange}
          onPreset={webdav.onPreset}
          onSync={webdav.onSync}
        />
        {report && report.conflictCount > 0 && (
          <section className="sync-conflict-report">
            <div><p className="eyebrow">SYNC CONFLICT REPORT</p><h3>最近同步冲突</h3><span>共 {report.conflictCount} 项，按更新时间与稳定内容指纹合并</span></div>
            <div className="sync-conflict-grid" role="table" aria-label="同步冲突比较">
              <div role="row" className="sync-conflict-head"><b role="columnheader">记录</b><b role="columnheader">本机</b><b role="columnheader">云端</b><b role="columnheader">合并结果</b></div>
              {report.conflicts.slice(0, 10).map((conflict) => (
                <div role="row" key={`${conflict.table}:${conflict.syncId}`}>
                  <span role="cell">{conflict.table}</span>
                  <span role="cell">{label(conflict.local)}<small>{formatTimestamp(conflict.localTimestamp)}</small></span>
                  <span role="cell">{label(conflict.remote)}<small>{formatTimestamp(conflict.remoteTimestamp)}</small></span>
                  <strong role="cell">{label(conflict.result)}<small>{conflict.winner === "local" ? "采用本机" : "采用云端"}</small></strong>
                </div>
              ))}
            </div>
            {(report.conflictCount > 10 || report.truncated > 0) && <small>仅展示前 10 项；其余冲突已按相同规则处理。</small>}
          </section>
        )}
        <QuickSyncSection
          accessUrl={quickSync.accessUrl}
          ledgerId={quickSync.ledgerId}
          status={quickSync.status}
          token={quickSync.token}
          message={quickSync.message}
          label={quickSync.label}
          expiryDays={quickSync.expiryDays}
          pending={pending}
          formatTimestamp={quickSync.formatTimestamp}
          onLabelChange={quickSync.onLabelChange}
          onExpiryChange={quickSync.onExpiryChange}
          onCopyToken={quickSync.onCopyToken}
          onCopyAddress={quickSync.onCopyAddress}
          onTest={quickSync.onTest}
          onCopyAndroidConfig={quickSync.onCopyAndroidConfig}
          onCreateAndCopyAndroidConfig={quickSync.onCreateAndCopyAndroidConfig}
          onCopyExample={quickSync.onCopyExample}
          onCopyTemplate={quickSync.onCopyTemplate}
          onCreate={quickSync.onCreate}
          onRevoke={quickSync.onRevoke}
        />
      </div>
    </dialog>
  );
}
