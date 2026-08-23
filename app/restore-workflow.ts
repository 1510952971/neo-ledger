import {
  restoreBackupPayload,
  restoreSavedSnapshot,
  type RestoreActionResult,
} from "./restore-actions.ts";
import { MAX_RESTORE_UPLOAD_BYTES } from "./client-api.ts";

export type RestorePreflightDetails = {
  planChecksum: string;
  message: string;
};

export function restorePreflightDetails(value: unknown): RestorePreflightDetails | null {
  if (!value || typeof value !== "object") return null;
  const summary = value as Record<string, unknown>;
  const planChecksum = summary.planChecksum;
  if (typeof planChecksum !== "string" || !/^[a-f0-9]{64}$/u.test(planChecksum))
    return null;
  const totalRecords = Number(summary.totalRecords);
  const estimatedStatements = Number(summary.estimatedStatements);
  return {
    planChecksum,
    message:
      Number.isFinite(totalRecords) && Number.isFinite(estimatedStatements)
        ? `预检通过：${totalRecords.toLocaleString("zh-CN")} 条记录，预计 ${estimatedStatements.toLocaleString("zh-CN")} 条数据库语句。恢复会覆盖当前全部数据，且无法撤销。`
        : "预检通过，但恢复摘要不完整。恢复会覆盖当前全部数据，且无法撤销。",
  };
}

type RestoreResponse = {
  response: Response;
  data: RestoreActionResult | null;
};

type BackupRestore = (input: {
  payload: string;
  dryRun?: boolean;
  planChecksum?: string;
}) => Promise<RestoreResponse>;

type SnapshotRestore = (input: {
  snapshotId: string;
  dryRun?: boolean;
  planChecksum?: string;
}) => Promise<RestoreResponse>;

export async function runRestoreBackupWorkflow(input: {
  file: File;
  confirm: (details: RestorePreflightDetails) => Promise<boolean>;
  restore?: BackupRestore;
}) {
  if (input.file.size > MAX_RESTORE_UPLOAD_BYTES)
    throw new Error("备份文件不能超过 50MB，请先拆分或压缩后再恢复。");
  const restore = input.restore ?? restoreBackupPayload;
  const payload = await input.file.text();
  const preflight = await restore({ payload, dryRun: true });
  const details = preflight.response.ok
    ? restorePreflightDetails(preflight.data?.summary)
    : null;
  if (!preflight.response.ok || !details)
    throw new Error(preflight.data?.error ?? "恢复预检失败，请修复备份后重试");
  if (!(await input.confirm(details))) return { cancelled: true as const };
  const result = await restore({ payload, planChecksum: details.planChecksum });
  return { cancelled: false as const, ...result };
}

export async function runRestoreSnapshotWorkflow(input: {
  snapshotId: string;
  confirm: (details: RestorePreflightDetails) => Promise<boolean>;
  restore?: SnapshotRestore;
}) {
  const restore = input.restore ?? restoreSavedSnapshot;
  const preflight = await restore({ snapshotId: input.snapshotId, dryRun: true });
  const details = preflight.response.ok
    ? restorePreflightDetails(preflight.data?.summary)
    : null;
  if (!preflight.response.ok || !details)
    throw new Error(preflight.data?.error ?? "回滚预检失败，请稍后重试");
  if (!(await input.confirm(details))) return { cancelled: true as const };
  const result = await restore({
    snapshotId: input.snapshotId,
    planChecksum: details.planChecksum,
  });
  return { cancelled: false as const, ...result };
}
