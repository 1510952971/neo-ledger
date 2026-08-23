"use client";

import type { AppUpdateInfo } from "./app-update-control";

export function AppUpdateSection({
  info,
  checking,
  applying,
  error,
  onCheck,
  onApply,
}: {
  info: AppUpdateInfo | null;
  checking: boolean;
  applying: boolean;
  error: string;
  onCheck: () => void | Promise<unknown>;
  onApply: () => void;
}) {
  return (
    <section className="app-update-band">
      <div>
        <p className="eyebrow">SIGNED GITHUB RELEASES</p>
        <h3>⬆️ 程序版本更新</h3>
        <p>更新前自动备份本地数据库；新版启动或迁移失败时自动恢复原版本。</p>
      </div>
      <div className="app-update-status">
        <span>当前版本 <b>v{info?.currentVersion ?? "…"}</b></span>
        <span>GitHub 最新 <b>v{info?.latestVersion ?? "…"}</b></span>
        <strong>
          {applying
            ? "正在备份、下载并验证更新…"
            : checking
              ? "正在检查 GitHub Release…"
              : info?.available
                ? "发现新版本"
                : info
                  ? "当前已是最新版"
                  : "等待检查"}
        </strong>
      </div>
      <div className="app-update-actions">
        <button type="button" onClick={() => void onCheck()} disabled={checking || applying}>↻ 检查更新</button>
        <button
          type="button"
          className="primary-update"
          onClick={onApply}
          disabled={!info?.available || !info.canApply || checking || applying}
        >
          ⬆ 立即升级
        </button>
        {info?.releaseUrl && <a href={info.releaseUrl} target="_blank" rel="noreferrer">GitHub 发布说明 ↗</a>}
      </div>
      {info?.available && !info.canApply && <small>网页部署版只提示版本；一键升级需在本机启动器中运行。</small>}
      {error && <p className="app-update-error">{error}</p>}
    </section>
  );
}
