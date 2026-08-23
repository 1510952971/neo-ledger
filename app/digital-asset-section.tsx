"use client";

import type { RefObject } from "react";
import { assetTypeIcon } from "./asset-core.js";

export type DigitalAssetSectionAsset = {
  id: number;
  ledgerId: number;
  name: string;
  assetType: string;
  currency: "CNY" | "USD" | "JPY" | "EUR";
  valuationMode: "自动折旧" | "手动估值";
  manualValue: number | null;
  purchasePrice: number;
  purchaseDate: string;
  createdAt: string;
  lifespanMonths: number;
  residualRateBps: number;
  heatLevel: "高" | "中" | "低" | null;
  updatedAt: string;
  currentValue: number;
  elapsedMonths: number;
  residualValue: number;
  valueChange: number;
  valueLost: number;
  changePercent: number;
  lossPercent: number;
  dailyDepreciation: number;
  heatLambda: number;
};

type DigitalAssetSectionProps = {
  sectionRef?: RefObject<HTMLElement | null>;
  assets: DigitalAssetSectionAsset[];
  rows: DigitalAssetSectionAsset[];
  totalValue: number;
  page: number;
  totalPages: number;
  totalRows: number;
  formatCurrency: (amount: number, currency: DigitalAssetSectionAsset["currency"]) => string;
  formatMoney: (amount: number) => string;
  onAdd: () => void;
  onEdit: (asset: DigitalAssetSectionAsset) => void;
  onLiquidate: (asset: DigitalAssetSectionAsset) => void;
  onPageChange: (page: number) => void;
};

/** Asset valuation cards are isolated from the page coordinator and its dialogs. */
export function DigitalAssetSection({
  sectionRef,
  assets,
  rows,
  totalValue,
  page,
  totalPages,
  totalRows,
  formatCurrency,
  formatMoney,
  onAdd,
  onEdit,
  onLiquidate,
  onPageChange,
}: DigitalAssetSectionProps) {
  return (
    <section className="digital-assets-section module-assets page-scroll-anchor" ref={sectionRef}>
      <div className="section-heading account-heading">
        <div>
          <p className="eyebrow">UNIVERSAL ASSET VAULT</p>
          <h2>全品类资产配置</h2>
          <span className="section-subline">
            房产、车辆、奢侈品、收藏品及自定义资产 · 当前估值合计 {formatMoney(totalValue / 100)}
          </span>
        </div>
        <button className="new-account-button" onClick={onAdd}>＋ 新增资产</button>
      </div>
      <div className="asset-shelf">
        {assets.length ? rows.map((asset) => {
          const valueDirection = asset.valueChange > 0 ? "gain" : asset.valueChange < 0 ? "loss" : "flat";
          return (
            <article className="digital-asset-card" key={asset.id}>
              <div className="asset-card-top">
                <span className="asset-device-icon">{assetTypeIcon(asset.assetType)}</span>
                <div><p>{asset.assetType}</p><h3>{asset.name}</h3></div>
                {asset.heatLevel && <b className={`heat-badge heat-${asset.heatLevel}`}>{asset.heatLevel}热度</b>}
              </div>
              <div className="asset-value-pair">
                <span>购入原值<b>{formatCurrency(asset.purchasePrice / 100, asset.currency)}</b></span>
                <i>→</i>
                <span>当前估值<strong>{formatCurrency(asset.currentValue / 100, asset.currency)}</strong></span>
              </div>
              <div className={`value-loss-copy ${valueDirection}`}>
                <span>{valueDirection === "gain" ? `较原值上涨 ${Math.abs(asset.changePercent).toFixed(1)}%` : valueDirection === "loss" ? `较原值下降 ${Math.abs(asset.changePercent).toFixed(1)}%` : "与原值持平"}</span>
                <b>{valueDirection === "gain" ? "+" : valueDirection === "loss" ? "-" : ""}{formatCurrency(Math.abs(asset.valueChange) / 100, asset.currency)}</b>
              </div>
              <div className={`value-loss-track ${valueDirection}`}><i style={{ width: `${Math.min(100, Math.abs(asset.changePercent))}%` }} /></div>
              <div className="depreciation-note">
                <span>⌁</span>
                {asset.valuationMode === "手动估值" ? <p>当前估值由你维护<b>可随市场变化随时更新</b></p> : <p>平均每天折旧损耗<b>{formatCurrency(asset.dailyDepreciation / 100, asset.currency)}</b></p>}
              </div>
              <div className="asset-card-meta">
                <span>购于 {asset.purchaseDate}</span>
                <span>{asset.currency} · {asset.valuationMode}{asset.valuationMode === "自动折旧" ? ` · ${asset.lifespanMonths} 月 / 残值 ${asset.residualRateBps / 100}%` : ""}</span>
              </div>
              <div className="asset-card-actions">
                <button className="asset-edit-button" onClick={() => onEdit(asset)}>✎ 修改资料</button>
                <button className="liquidate-button" onClick={() => onLiquidate(asset)}>🛒 变现 / 报废</button>
              </div>
            </article>
          );
        }) : <div className="asset-shelf-empty"><span>⌁</span><strong>资产库还是空的</strong><p>房产、车辆、珠宝、收藏品或任何自定义资产都可以在这里统一管理。</p></div>}
      </div>
      {totalPages > 1 && (
        <nav className="bill-pagination asset-pagination" aria-label="全品类资产分页">
          <button className="bill-page-arrow" aria-label="上一页资产" title="上一页" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</button>
          <label><span>第</span><select value={page} aria-label="选择资产页码" onChange={(event) => onPageChange(Number(event.target.value))}>{Array.from({ length: totalPages }, (_, index) => index + 1).map((value) => <option value={value} key={value}>{value}</option>)}</select><span>/ {totalPages} 页 · 共 {totalRows} 件</span></label>
          <button className="bill-page-arrow" aria-label="下一页资产" title="下一页" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>›</button>
        </nav>
      )}
    </section>
  );
}
