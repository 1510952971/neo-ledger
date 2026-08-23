"use client";

import type { QuickSyncStatus } from "./quick-sync-state";

export function QuickSyncSection({
  accessUrl,
  ledgerId,
  status,
  token,
  message,
  label,
  expiryDays,
  pending,
  formatTimestamp,
  onLabelChange,
  onExpiryChange,
  onCopyToken,
  onCopyAddress,
  onTest,
  onCopyAndroidConfig,
  onCreateAndCopyAndroidConfig,
  onCopyExample,
  onCopyTemplate,
  onCreate,
  onRevoke,
}: {
  accessUrl: string;
  ledgerId: number;
  status: QuickSyncStatus | null;
  token: string;
  message: string;
  label: string;
  expiryDays: number;
  pending: boolean;
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
}) {
  const androidReady = Boolean(status?.active && token);
  return (
    <article className="geek-channel">
      <div><span>🌐</span><div><p className="eyebrow">AUTOMATION BRIDGE</p><h3>自动记账连接</h3></div></div>
      <p>把 Android 支付通知或付款完成界面、iPhone 快捷指令或 NAS 自动化接入当前账本。Android 只在支付完成后自动记账，不会读取照片或历史账单。</p>
      <div className="quick-sync-status">
        <span>状态：<b>{status?.active ? "已启用" : "未启用"}</b></span>
        {status?.tokenPrefix && <code>{status.tokenPrefix}</code>}
        {status?.label && <small>连接：{status.label}</small>}
        {status?.scope && <small>权限：仅写入账本</small>}
        {status?.createdAt && <small>签发：{formatTimestamp(status.createdAt)}</small>}
        {status?.expiresAt && <small>到期：{formatTimestamp(status.expiresAt)}</small>}
        {status?.lastUsedAt && <small>最近使用：{formatTimestamp(status.lastUsedAt)}</small>}
        {Boolean(status?.processedCount) && <small>已接收：{status?.processedCount} 笔</small>}
      </div>
      <section className="android-quick-setup" aria-label="Android 自动记账快速配置">
        <div className="android-quick-setup-head"><strong>Android 多 App 支付识别</strong><small>{androidReady ? "已准备好配置" : "3 步完成连接"}</small></div>
        <div className="android-quick-setup-address">
          <span>手机连接地址</span>
          <code>{accessUrl || "正在检测局域网地址…"}</code>
          <button type="button" onClick={onCopyAddress} disabled={!accessUrl}>复制地址</button>
          <span>当前账本 ID</span>
          <code>{ledgerId}</code>
        </div>
        <ol>
          <li className={androidReady ? "complete" : "current"}><b>1</b><span>生成并复制配置</span></li>
          <li className={androidReady ? "current" : ""}><b>2</b><span>伴侣 App 粘贴配置并开权限</span></li>
          <li className={androidReady ? "current" : ""}><b>3</b><span>发送 ¥0.01 测试账单</span></li>
        </ol>
        <div className="android-quick-setup-actions">
          {!androidReady
            ? <button type="button" className="primary" onClick={() => void onCreateAndCopyAndroidConfig()} disabled={pending || !label.trim()}>生成并复制安卓配置</button>
            : <>
              <button type="button" className="primary" onClick={() => void onCopyAndroidConfig()}>复制安卓配置</button>
              <button type="button" onClick={() => void onTest()} disabled={pending}>发送 ¥0.01 测试账单</button>
            </>}
        </div>
        <small className="android-quick-setup-hint">支持微信、支付宝、淘宝、京东、美团等；在伴侣 App 中额外开启“无障碍支付识别”，手机与电脑需在同一 Wi-Fi。</small>
      </section>
      <details className="quick-sync-advanced">
        <summary>高级设置与其他连接</summary>
        <div className="quick-sync-settings">
          <label><span>连接名称</span><input value={label} maxLength={60} onChange={(event) => onLabelChange(event.target.value)} placeholder="例如：我的手机" /></label>
          <label><span>有效期</span><select value={expiryDays} onChange={(event) => onExpiryChange(Number(event.target.value))}><option value={30}>30 天</option><option value={90}>90 天</option><option value={365}>1 年</option><option value={730}>2 年</option></select></label>
          <label><span>权限</span><input value="仅写入账本（ledger:write）" readOnly /></label>
        </div>
        {token && <div className="quick-sync-token">
          <small>密钥只显示这一次</small><code>{token}</code>
          <button type="button" onClick={onCopyToken}>复制密钥</button>
          <button type="button" onClick={() => void onCopyExample()}>复制请求示例</button>
          <button type="button" onClick={() => void onCopyTemplate("shortcut")}>复制快捷指令配置</button>
          <button type="button" onClick={() => void onCopyTemplate("notification")}>复制通知转发配置</button>
        </div>}
        <div className="quick-sync-actions">
          <button type="button" onClick={onCreate} disabled={pending || !label.trim()}>{status?.active ? "重新生成密钥" : "生成自动记账密钥"}</button>
          {status?.active && <button type="button" className="danger" onClick={() => void onRevoke()} disabled={pending}>撤销密钥</button>}
        </div>
      </details>
      {message && <small>{message}</small>}
    </article>
  );
}
