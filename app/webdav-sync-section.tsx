"use client";

import type { WebdavConfig, WebdavSession } from "./browser-settings-state";

export function WebdavSyncSection({
  config,
  session,
  mode,
  syncing,
  status,
  onConfigChange,
  onSessionChange,
  onPreset,
  onSync,
}: {
  config: WebdavConfig;
  session: WebdavSession;
  mode: string | null;
  syncing: boolean;
  status: string;
  onConfigChange: (patch: Partial<WebdavConfig>) => void;
  onSessionChange: (patch: Partial<WebdavSession>) => void;
  onPreset: () => void;
  onSync: (formData: FormData) => void | Promise<void>;
}) {
  const modeLabel = mode === "upload" ? "仅上传" : mode === "download" ? "仅下载并覆盖本机" : "安全双向同步";
  return (
    <section className="webdav-tower">
      <div className="orbit-visual"><div className="planet">🔐</div><i /><i /><span>🛰️</span></div>
      <div className="webdav-content">
        <p className="eyebrow">E2EE SOVEREIGN SYNC</p>
        <h3>多端云同步控制塔</h3>
        <p>当前标签页填写一次，以后只点“立即安全同步”。首次自动创建备份，后续自动双向合并；关闭标签页后密码与同步密钥自动清除。</p>
        <form action={onSync}>
          <label>
            <span>WebDAV 文件夹地址 <button type="button" className="webdav-preset" onClick={onPreset}>使用坚果云</button></span>
            <input name="url" type="url" value={config.url} onChange={(event) => onConfigChange({ url: event.target.value })} placeholder="https://dav.jianguoyun.com/dav/NeoLedger" required />
          </label>
          <small className="webdav-file-location">云端文件：<code>{config.url ? `${config.url.replace(/\/+$/, "")}/neo-ledger.e2ee.json` : "填写文件夹地址后自动确定"}</code></small>
          <div>
            <label><span>用户名</span><input name="username" value={config.username} onChange={(event) => onConfigChange({ username: event.target.value })} /></label>
            <label><span>应用密码</span><input name="password" type="password" value={session.password} onChange={(event) => onSessionChange({ password: event.target.value })} autoComplete="new-password" /></label>
          </div>
          <label><span>本地同步密钥</span><input name="secret" type="password" value={session.secret} onChange={(event) => onSessionChange({ secret: event.target.value })} minLength={8} placeholder="至少 8 位；遗失后云端密文无法恢复" required /></label>
          <div className="webdav-auto-row">
            <label><input type="checkbox" checked={config.autoSync} onChange={(event) => onConfigChange({ autoSync: event.target.checked })} /><span>自动同步</span></label>
            <select aria-label="自动同步间隔" value={config.intervalMinutes} onChange={(event) => onConfigChange({ intervalMinutes: Number(event.target.value) })}>
              <option value={1}>每 1 分钟</option><option value={5}>每 5 分钟</option><option value={15}>每 15 分钟</option><option value={30}>每 30 分钟</option>
            </select>
          </div>
          <div className="sync-actions"><button className={`smart-sync-button ${mode === "smart" ? "active" : mode ? "inactive" : ""}`} name="mode" value="smart" disabled={syncing}>{syncing && mode === "smart" ? "正在安全同步…" : "立即安全同步"}</button></div>
          <details className="webdav-advanced"><summary>高级操作</summary><div className="sync-actions advanced-sync-actions">
            <button className={mode === "upload" ? "active" : ""} name="mode" value="upload" disabled={syncing}>{syncing && mode === "upload" ? "正在仅上传…" : "仅上传"}</button>
            <button className={mode === "download" ? "active" : ""} name="mode" value="download" disabled={syncing}>{syncing && mode === "download" ? "正在下载覆盖…" : "仅下载并覆盖本机"}</button>
          </div></details>
        </form>
        <small>{syncing ? `当前操作：${modeLabel}` : `${mode ? `当前模式：${modeLabel} · ` : ""}上次同步：${status}`}</small>
      </div>
    </section>
  );
}
