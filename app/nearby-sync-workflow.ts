type Snapshot = Record<string, unknown>;
type OperationResult<T> = { response: Response; data: T | null };

export type NearbyMergeWorkflowResult = {
  status: string;
  mergeReport: unknown | null;
};

export async function runNearbyMergeWorkflow(input: {
  payload: string;
  pairingCode: string;
  packageId?: string;
  room: string;
  decrypt: (payload: string, secret: string) => Promise<Snapshot>;
  exportSnapshot: () => Promise<OperationResult<Snapshot>>;
  merge: (local: Snapshot, remote: Snapshot) => Snapshot;
  restore: (snapshot: Snapshot) => Promise<OperationResult<{ error?: string }>>;
  deletePackage: (room: string, packageId: string) => Promise<OperationResult<{ error?: string }>>;
}): Promise<NearbyMergeWorkflowResult> {
  const remote = await input.decrypt(input.payload, `nearby:${input.pairingCode}`);
  const localResult = await input.exportSnapshot();
  if (
    !localResult.response.ok ||
    !localResult.data ||
    typeof localResult.data !== "object" ||
    Array.isArray(localResult.data)
  )
    throw new Error("读取本地账本失败");
  const merged = input.merge(localResult.data, remote);
  const mergeReport = merged.mergeReport ?? null;
  const restored = await input.restore(merged);
  if (!restored.response.ok) throw new Error(restored.data?.error || "合并失败");
  if (input.packageId) {
    const deleted = await input.deletePackage(input.room, input.packageId);
    if (!deleted.response.ok) throw new Error(deleted.data?.error || "清理局域网同步包失败");
  }
  const conflictCount = Number(
    (mergeReport as { conflictCount?: unknown } | null)?.conflictCount ?? 0,
  );
  return {
    status: `附近同步完成${conflictCount ? `，已按更新时间解决 ${conflictCount} 项冲突` : ""}，正在刷新账本…`,
    mergeReport,
  };
}
