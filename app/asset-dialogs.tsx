"use client";

import type { RefObject } from "react";
import { ASSET_TYPE_OPTIONS } from "./asset-core.js";

type Currency = "CNY" | "USD" | "JPY" | "EUR";
type ValuationMode = "自动折旧" | "手动估值";
type AssetDialogAsset = {
  id: number;
  name: string;
  assetType: string;
  currency: Currency;
  valuationMode: ValuationMode;
  manualValue: number | null;
  purchasePrice: number;
  purchaseDate: string;
  lifespanMonths: number;
  residualRateBps: number;
  heatLevel: "高" | "中" | "低" | null;
  currentValue: number;
  changePercent: number;
  updatedAt: string;
};
type AssetDialogAccount = { id: number; name: string; type: "资产" | "负债"; currency: Currency; icon: string };

type AssetDialogsProps = {
  assetOpen: boolean;
  assetRef: RefObject<HTMLDialogElement | null>;
  editingAsset: AssetDialogAsset | null;
  liquidatingAsset: AssetDialogAsset | null;
  assetType: string;
  assetValuationMode: ValuationMode;
  assetError: string;
  pending: boolean;
  todayKey: string;
  accountList: AssetDialogAccount[];
  formatCurrency: (amount: number, currency: Currency) => string;
  liquidationRef: RefObject<HTMLDialogElement | null>;
  onCloseAsset: () => void;
  onCloseLiquidation: () => void;
  onChooseAssetType: (value: string) => void;
  onValuationModeChange: (value: ValuationMode) => void;
  onSubmitAsset: (formData: FormData) => void | Promise<void>;
  onSubmitLiquidation: (formData: FormData) => void | Promise<void>;
};

/** Asset onboarding and liquidation remain presentational; financial writes stay in page actions. */
export function AssetDialogs({
  assetOpen,
  assetRef,
  editingAsset,
  liquidatingAsset,
  assetType,
  assetValuationMode,
  assetError,
  pending,
  todayKey,
  accountList,
  formatCurrency,
  liquidationRef,
  onCloseAsset,
  onCloseLiquidation,
  onChooseAssetType,
  onValuationModeChange,
  onSubmitAsset,
  onSubmitLiquidation,
}: AssetDialogsProps) {
  return (
    <>
      {assetOpen && (
        <dialog className="expense-dialog asset-dialog" ref={assetRef} onCancel={onCloseAsset}>
          <form action={onSubmitAsset} className="expense-form" key={editingAsset?.id ?? "new-asset"}>
            <button type="button" className="close-button" onClick={onCloseAsset}>×</button>
            <p className="eyebrow">UNIVERSAL ASSET ONBOARDING</p>
            <h2>{editingAsset ? "✎ 修改资产" : "⌁ 新增资产"}</h2>
            <p className="form-subtitle">可管理会折旧、保值或升值的实物与虚拟资产。</p>
            <label className="title-field"><span>资产名称</span><input name="name" placeholder="如：自住房、家用车、腕表" defaultValue={editingAsset?.name ?? ""} required /></label>
            <fieldset>
              <legend>资产类型</legend>
              <div className="asset-type-switch">
                {ASSET_TYPE_OPTIONS.map(({ name, icon }) => <button type="button" className={assetType === name ? "active" : ""} onClick={() => onChooseAssetType(name)} key={name}><span>{icon}</span>{name}</button>)}
              </div>
            </fieldset>
            {assetType === "其他资产" && <label className="title-field"><span>自定义资产类型</span><input name="customAssetType" maxLength={24} placeholder="如：游艇、乐器、艺术品" defaultValue={editingAsset && !ASSET_TYPE_OPTIONS.some((option) => option.name === editingAsset.assetType) ? editingAsset.assetType : ""} required /></label>}
            <fieldset>
              <legend>估值方式</legend>
              <div className="asset-type-switch valuation-mode-switch">
                {(["自动折旧", "手动估值"] as const).map((mode) => <button type="button" className={assetValuationMode === mode ? "active" : ""} onClick={() => onValuationModeChange(mode)} key={mode}><span>{mode === "自动折旧" ? "📉" : "✍️"}</span>{mode}</button>)}
              </div>
            </fieldset>
            <div className="two-fields">
              <label className="title-field"><span>购入原值</span><input name="purchasePrice" type="number" min="0.01" step="0.01" placeholder="8999.00" defaultValue={editingAsset ? (editingAsset.purchasePrice / 100).toFixed(2) : ""} required /></label>
              <label className="title-field"><span>资产币种</span><select name="currency" defaultValue={editingAsset?.currency ?? "CNY"}><option value="CNY">CNY · 人民币</option><option value="USD">USD · 美元</option><option value="JPY">JPY · 日元</option><option value="EUR">EUR · 欧元</option></select></label>
            </div>
            <label className="title-field"><span>购入 / 建档日期</span><input name="purchaseDate" type="date" max={todayKey || undefined} defaultValue={editingAsset?.purchaseDate ?? todayKey} required /></label>
            {assetValuationMode === "手动估值" ? (
              <label className="title-field"><span>当前市场估值</span><input name="manualValue" type="number" min="0" step="0.01" placeholder="可高于或低于购入原值" defaultValue={editingAsset ? ((editingAsset.manualValue ?? editingAsset.currentValue) / 100).toFixed(2) : ""} required /></label>
            ) : (
              <div className="two-fields" key={`asset-auto-${assetType}-${editingAsset?.id ?? "new"}`}>
                <label className="title-field"><span>预期寿命（月）</span><input name="lifespanMonths" type="number" min="1" max="1200" defaultValue={editingAsset?.valuationMode === "自动折旧" ? editingAsset.lifespanMonths : (ASSET_TYPE_OPTIONS.find((option) => option.name === assetType)?.lifespan ?? 60)} required /></label>
                <label className="title-field"><span>保底残值率（%）</span><input name="residualRate" type="number" min="0" max="100" step="0.1" defaultValue={editingAsset?.valuationMode === "自动折旧" ? editingAsset.residualRateBps / 100 : (ASSET_TYPE_OPTIONS.find((option) => option.name === assetType)?.residualRate ?? 10)} required /></label>
              </div>
            )}
            {assetType === "游戏账号" && <label className="title-field heat-field"><span>市场热度</span><select name="heatLevel" defaultValue={editingAsset?.heatLevel ?? "中"}><option value="高">🔥 高热度 · 衰减较慢</option><option value="中">🌤️ 中热度 · 标准衰减</option><option value="低">🧊 低热度 · 急速贬值</option></select><small>热度将作为指数项叠加到基础寿命折旧中。</small></label>}
            {assetError && <p className="account-error">{assetError}</p>}
            <button className="submit-button" disabled={pending}>{pending ? "正在保存资产…" : editingAsset ? "保存资产修改" : "加入资产库"}</button>
          </form>
        </dialog>
      )}
      {liquidatingAsset && (
        <dialog className="expense-dialog asset-dialog" ref={liquidationRef} onCancel={onCloseLiquidation}>
          <form action={onSubmitLiquidation} className="expense-form">
            <button type="button" className="close-button" onClick={onCloseLiquidation}>×</button>
            <p className="eyebrow">LIQUIDATION DESK</p>
            <h2>🛒 变现 {liquidatingAsset.name}</h2>
            <div className="liquidation-quote"><span>系统当前估值</span><strong>{formatCurrency(liquidatingAsset.currentValue / 100, liquidatingAsset.currency)}</strong><small>相对原值变动 {liquidatingAsset.changePercent >= 0 ? "+" : ""}{liquidatingAsset.changePercent.toFixed(1)}%</small></div>
            <label className="title-field"><span>实际变现价格（{liquidatingAsset.currency}）</span><input name="salePrice" type="number" min="0.01" step="0.01" defaultValue={(liquidatingAsset.currentValue / 100).toFixed(2)} /></label>
            <label className="title-field">
              <span>收入存入同币种账户</span>
              <select name="accountId" defaultValue={accountList.find((item) => item.type === "资产" && item.currency === liquidatingAsset.currency)?.id}>
                {accountList.filter((item) => item.type === "资产" && item.currency === liquidatingAsset.currency).map((account) => <option value={account.id} key={account.id}>{account.icon} {account.name}</option>)}
              </select>
              {!accountList.some((item) => item.type === "资产" && item.currency === liquidatingAsset.currency) && <small>暂无 {liquidatingAsset.currency} 资产账户，请先新建同币种账户，或直接报废注销。</small>}
            </label>
            {assetError && <p className="account-error">{assetError}</p>}
            <div className="liquidation-actions"><button name="mode" value="discard" className="discard-button" disabled={pending}>直接报废 · 不入账</button><button name="mode" value="sell" className="submit-button" disabled={pending}>确认变现并入账</button></div>
          </form>
        </dialog>
      )}
    </>
  );
}
