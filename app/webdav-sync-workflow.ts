export type WebDavWorkflowMode = "smart" | "upload" | "download";

type Snapshot = Record<string, unknown>;
type OperationResult<T> = { response: Response; data: T | null };

export type WebDavWorkflowResult = {
  status: string;
  changedLocal: boolean;
  mergeReport: unknown | null;
};

export async function runWebDavSyncWorkflow(input: {
  mode: WebDavWorkflowMode;
  secret: string;
  exportSnapshot: () => Promise<OperationResult<Snapshot>>;
  encrypt: (snapshot: Snapshot, secret: string) => Promise<string>;
  decrypt: (payload: string, secret: string) => Promise<Snapshot>;
  merge: (local: Snapshot, remote: Snapshot) => Snapshot;
  upload: (payload: string) => Promise<OperationResult<{ error?: string }>>;
  download: () => Promise<OperationResult<{ payload?: string; error?: string }>>;
  restore: (snapshot: Snapshot) => Promise<OperationResult<{ error?: string }>>;
}): Promise<WebDavWorkflowResult> {
  const { mode, secret } = input;
  const localResult = await input.exportSnapshot();
  if (
    !localResult.response.ok ||
    !localResult.data ||
    typeof localResult.data !== "object" ||
    Array.isArray(localResult.data)
  )
    throw new Error("读取本地账本失败");
  const local = localResult.data;

  const upload = async (snapshot: Snapshot) => {
    const payload = await input.encrypt(snapshot, secret);
    const result = await input.upload(payload);
    if (!result.response.ok) throw new Error(result.data?.error || "加密上传失败");
  };

  if (mode === "upload") {
    await upload(local);
    return { status: "刚刚完成加密上传", changedLocal: false, mergeReport: null };
  }

  const downloaded = await input.download();
  const remotePayload = downloaded.data?.payload;
  if (!downloaded.response.ok || !remotePayload) {
    if (mode === "smart" && /404|没有备份/u.test(downloaded.data?.error || "")) {
      await upload(local);
      return {
        status: "首次安全同步完成，已创建云端加密备份",
        changedLocal: false,
        mergeReport: null,
      };
    }
    throw new Error(downloaded.data?.error || "云端没有备份");
  }

  const remote = await input.decrypt(remotePayload, secret);
  let next = remote;
  let mergeReport: unknown | null = null;
  if (mode === "smart") {
    next = input.merge(local, remote);
    mergeReport = next.mergeReport ?? null;
    await upload(next);
  }
  const restored = await input.restore(next);
  if (!restored.response.ok) throw new Error(restored.data?.error || "恢复本地账本失败");

  const conflictCount = Number(
    (mergeReport as { conflictCount?: unknown } | null)?.conflictCount ?? 0,
  );
  return {
    status:
      mode === "smart"
        ? `刚刚完成安全双向同步${conflictCount ? ` · 自动解决 ${conflictCount} 项冲突` : ""}`
        : "刚刚从云端解密恢复",
    changedLocal: true,
    mergeReport,
  };
}
