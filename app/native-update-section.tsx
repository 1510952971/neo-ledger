"use client";

import type { NativeUpdateInfo } from "./native-update-control";

type DownloadRow = {
  label: string;
  description: string;
  asset: string | null;
};

type DownloadRowDefinition = Omit<DownloadRow, "asset">;

const downloadRows: DownloadRowDefinition[] = [
  { label: "Android APK", description: "手机直接安装包" },
  { label: "Android AAB", description: "Google Play / 应用商店发布包" },
  { label: "macOS DMG", description: "Mac 安装镜像" },
  { label: "Windows 安装器", description: "Windows Setup 安装包" },
  { label: "Web / NAS", description: "Web 与 NAS 部署归档" },
];

function findAsset(info: NativeUpdateInfo, suffix: string) {
  return Object.keys(info.githubAssets).find((name) => name.endsWith(suffix)) ?? null;
}

function buildRows(info: NativeUpdateInfo): DownloadRow[] {
  return downloadRows.map((row) => ({
    ...row,
    asset:
      row.label === "Android APK"
        ? findAsset(info, ".apk")
        : row.label === "Android AAB"
          ? findAsset(info, ".aab")
          : row.label === "macOS DMG"
            ? findAsset(info, "macos-" + info.latestVersion + ".dmg")
            : row.label === "Windows 安装器"
              ? findAsset(info, "windows-" + info.latestVersion + "-setup.exe")
              : findAsset(info, ".tar.gz"),
  }));
}

export function NativeUpdateSection({
  info,
  checking,
  error,
  onCheck,
}: {
  info: NativeUpdateInfo | null;
  checking: boolean;
  error: string;
  onCheck: () => void | Promise<unknown>;
}) {
  const rows = info ? buildRows(info) : [];
  return (
    <section className="native-update-band">
      <div className="native-update-heading">
        <div>
          <p className="eyebrow">ANDROID · MACOS · WINDOWS · WEB</p>
          <h3>📦 原生客户端与安装包</h3>
          <p>在网页版直接检查和下载手机、电脑及 Web/NAS 安装包。服务地址优先，GitHub 自动备用。</p>
        </div>
        <div className="native-update-version">
          <span>最新稳定版</span>
          <strong>{info ? `v${info.latestVersion}` : "未检查"}</strong>
          <small>{checking ? "正在检查…" : info?.releaseName ?? "点击检查获取安装包"}</small>
        </div>
      </div>
      <div className="native-update-actions">
        <button type="button" onClick={() => void onCheck()} disabled={checking}>
          {checking ? "检查中…" : "↻ 检查版本更新"}
        </button>
        {info?.releaseUrl && <a href={info.releaseUrl} target="_blank" rel="noreferrer">查看发布说明 ↗</a>}
      </div>
      {info && (
        <div className="native-download-list">
          {rows.map((row) => {
            const serviceUrl = row.asset ? info.serviceAssets[row.asset] : null;
            const githubUrl = row.asset ? info.githubAssets[row.asset] : null;
            return (
              <div className="native-download-row" key={row.label}>
                <div>
                  <strong>{row.label}</strong>
                  <small>{row.asset ? row.description : "当前发布未提供此格式"}</small>
                </div>
                <div className="native-download-links">
                  {serviceUrl && <a href={serviceUrl} download>服务地址下载</a>}
                  {githubUrl && <a href={githubUrl} target="_blank" rel="noreferrer">GitHub 备用</a>}
                </div>
              </div>
            );
          })}
          {info.githubAssets["SHA256SUMS.txt"] && (
            <div className="native-download-checksum">
              <span>安全校验</span>
              <a href={info.serviceAssets["SHA256SUMS.txt"] ?? info.githubAssets["SHA256SUMS.txt"]} download>下载 SHA256SUMS.txt</a>
            </div>
          )}
        </div>
      )}
      {error && <p className="app-update-error">{error}</p>}
    </section>
  );
}
