"use client";

import type { NearbyDownload, NearbyPackage, NearbyPeer } from "./nearby-sync-state";

export function NearbySyncSection({
  accessUrl,
  pairingCode,
  receiveCode,
  download,
  packages,
  packageId,
  uploading,
  peers,
  status,
  pending,
  onCopy,
  onStatus,
  onRefreshAddress,
  onCreatePackage,
  onDownloadPackage,
  onUploadPackage,
  onReceiveCodeChange,
  onReceivePackage,
}: {
  accessUrl: string;
  pairingCode: string;
  receiveCode: string;
  download: NearbyDownload | null;
  packages: NearbyPackage[];
  packageId: string;
  uploading: boolean;
  peers: NearbyPeer[];
  status: string;
  pending: boolean;
  onCopy: (value: string) => void | Promise<unknown>;
  onStatus: (value: string) => void;
  onRefreshAddress: () => void;
  onCreatePackage: () => void | Promise<unknown>;
  onDownloadPackage: () => void;
  onUploadPackage: () => void | Promise<unknown>;
  onReceiveCodeChange: (value: string) => void;
  onReceivePackage: (id: string) => void;
}) {
  return (
    <section className="p2p-star-cluster">
      <div className="nearby-sync-content">
        <p className="eyebrow">NEARBY ENCRYPTED TRANSFER</p>
        <h3>📲 附近设备同步</h3>
        <p>两台设备打开同一个局域网地址即可。发送端生成加密同步包并点击“通过局域网发送”，接收端输入配对码后获取并合并，不会覆盖较新的记录。</p>
        <div className="nearby-access-url">
          <span>本机局域网连接地址</span>
          <code>{accessUrl || "正在获取…"}</code>
          <button type="button" disabled={!accessUrl} onClick={() => { if (!accessUrl) return; void onCopy(accessUrl); onStatus("局域网地址已复制，请发给另一台设备。"); }}>复制地址</button>
        </div>
        <div className="nearby-access-actions"><button type="button" onClick={onRefreshAddress}>重新检测地址</button></div>
        <div className="nearby-sync-grid">
          <article>
            <span>1 · 从这台设备发出</span>
            <button type="button" className="nearby-primary" onClick={() => void onCreatePackage()} disabled={pending}>生成同步包</button>
            {pairingCode && <div className="nearby-code">
              <small>告诉接收方这个配对码</small>
              <strong>{pairingCode}</strong>
              <button type="button" onClick={() => { void onCopy(pairingCode); onStatus("配对码已复制，请与同步包一起发送。"); }}>复制</button>
            </div>}
            {download && <>
              <button type="button" onClick={onDownloadPackage}>下载同步包</button>
              <button type="button" onClick={() => void onUploadPackage()} disabled={uploading}>{uploading ? "正在发送…" : "通过局域网发送"}</button>
              {packageId && <small>已发送，接收设备可直接获取（15 分钟内有效）</small>}
            </>}
          </article>
          <article>
            <span>2 · 在这台设备接收</span>
            <small>发送设备上传后，同步包会自动出现在这里。</small>
            <input value={receiveCode} onChange={(event) => onReceiveCodeChange(event.target.value)} placeholder="输入 8 位配对码" autoComplete="off" />
            {packages.length ? <div className="nearby-lan-packages">
              <small>局域网待接收同步包</small>
              {packages.map((item) => <button type="button" key={item.id} onClick={() => onReceivePackage(item.id)} disabled={pending || !receiveCode}>获取并合并 · {Math.ceil(item.size / 1024)} KB</button>)}
            </div> : <small>等待发送设备点击“通过局域网发送”…</small>}
          </article>
        </div>
        <small className="nearby-status">{status}</small>
        <div className="nearby-peers">
          <span>在线设备</span>
          {peers.length ? peers.map((peer) => <small key={peer.nodeId}>{peer.label} · 已在线</small>) : <small>另一台设备打开数据中心后会自动出现</small>}
        </div>
        <small className="nearby-lan-hint">在线设备仅用于确认连接状态，实际同步请使用上方“通过局域网发送”。</small>
      </div>
    </section>
  );
}
