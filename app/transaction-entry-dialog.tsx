"use client";

import type { RefObject } from "react";

type EntryType = "支出" | "收入";
type Mood = "悦己" | "刚需" | "冲动";
type SplitMode = "全额由我支付" | "全额由对方支付" | "按比例平摊" | null;
type Currency = "CNY" | "USD" | "JPY" | "EUR";
type EntryAccount = { id: number; name: string; icon: string; currency: Currency };
type EntryMember = { id: number; name: string; icon: string; isMe: boolean };
type EntryMeta = Record<string, { emoji: string; color?: string }>;
type EntryParsedPreview = {
  amount: string;
  category: string;
  title: string;
  type: EntryType;
  incomeCategory: string;
  mood: Mood;
  accountId: number;
  accountName: string;
};

type TransactionEntryDialogProps = {
  open: boolean;
  dialogRef: RefObject<HTMLDialogElement | null>;
  pending: boolean;
  entryType: EntryType;
  onEntryTypeChange: (value: EntryType) => void;
  currencySymbol: Record<Currency, string>;
  accountList: EntryAccount[];
  accountId: number;
  onAccountChange: (value: number) => void;
  parsedAmount: string;
  parsedTitle: string;
  memberList: EntryMember[];
  splitMemberId: number;
  onSplitMemberChange: (value: number) => void;
  onAddMember: () => void | Promise<void>;
  splitMode: SplitMode;
  onSplitModeChange: (value: Exclude<SplitMode, null>) => void;
  mySharePercent: number;
  onShareChange: (value: number) => void;
  categories: string[];
  category: string;
  categoryMeta: EntryMeta;
  onCategoryChange: (value: string) => void;
  moods: Mood[];
  mood: Mood;
  moodMeta: Record<Mood, { emoji: string; label: string; color: string }>;
  onMoodChange: (value: Mood) => void;
  onOpenCategoryManager: () => void;
  importText: string;
  onImportTextChange: (value: string) => void;
  receiptUrl: string | null;
  scanning: boolean;
  onScanReceipt: (file: File | undefined) => void;
  onRunParser: () => void;
  parsedPreview: EntryParsedPreview | null;
  onConfirmParsed: () => void;
  activeIncomeCategories: string[];
  incomeCategory: string;
  incomeMeta: EntryMeta;
  onIncomeCategoryChange: (value: string) => void;
  selectedIncomeCategory?: { builtinKey: string | null };
  onOpenIncomeManager: () => void;
  nudgeActive: boolean;
  threeDayImpulse: boolean;
  reflectionPhrase: string;
  reflection: string;
  onReflectionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (formData: FormData) => void | Promise<void>;
};

/** The highest-frequency financial form; state and writes remain in the page coordinator. */
export function TransactionEntryDialog({
  open,
  dialogRef,
  pending,
  entryType,
  onEntryTypeChange,
  currencySymbol,
  accountList,
  accountId,
  onAccountChange,
  parsedAmount,
  parsedTitle,
  memberList,
  splitMemberId,
  onSplitMemberChange,
  onAddMember,
  splitMode,
  onSplitModeChange,
  mySharePercent,
  onShareChange,
  categories,
  category,
  categoryMeta,
  onCategoryChange,
  moods,
  mood,
  moodMeta,
  onMoodChange,
  onOpenCategoryManager,
  importText,
  onImportTextChange,
  receiptUrl,
  scanning,
  onScanReceipt,
  onRunParser,
  parsedPreview,
  onConfirmParsed,
  activeIncomeCategories,
  incomeCategory,
  incomeMeta,
  onIncomeCategoryChange,
  selectedIncomeCategory,
  onOpenIncomeManager,
  nudgeActive,
  threeDayImpulse,
  reflectionPhrase,
  reflection,
  onReflectionChange,
  onClose,
  onSubmit,
}: TransactionEntryDialogProps) {
  if (!open) return null;

  const triggerHaptic = (ms = 6) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(ms);
    }
  };

  const setQuickDate = (offsetDays: number) => {
    triggerHaptic(8);
    const date = new Date();
    date.setDate(date.getDate() - offsetDays);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const formatted = `${yyyy}-${mm}-${dd}T${hh}:${min}`;
    const input = document.querySelector<HTMLInputElement>('input[name="occurredAt"]');
    if (input) input.value = formatted;
  };

  return (
    <dialog
      className="expense-dialog entry-dialog"
      ref={dialogRef}
      onCancel={onClose}
      aria-labelledby="transaction-entry-title"
    >
      <form action={onSubmit} className="expense-form">
        <div className="dialog-handle" aria-hidden="true" />
        <button type="button" className="close-button" onClick={onClose}>×</button>
        <p className="eyebrow">SMART ENTRY</p>
        <h2 id="transaction-entry-title">记一笔资金流</h2>
        <div className="type-switch">
          <button
            type="button"
            className={entryType === "支出" ? "active" : ""}
            onClick={() => {
              triggerHaptic(10);
              onEntryTypeChange("支出");
            }}
          >
            支出
          </button>
          <button
            type="button"
            className={entryType === "收入" ? "active" : ""}
            onClick={() => {
              triggerHaptic(10);
              onEntryTypeChange("收入");
            }}
          >
            收入
          </button>
        </div>
        <label className="amount-field">
          <span>{currencySymbol[accountList.find((item) => item.id === accountId)?.currency ?? "CNY"]}</span>
          <input key={parsedAmount} name="amount" type="number" min="0.01" step="0.01" defaultValue={parsedAmount} placeholder="0.00" inputMode="decimal" required autoFocus />
        </label>
        <div className="two-fields">
          <label className="title-field">
            <span>{entryType === "支出" ? "账单名称" : "收入备注"}</span>
            <input key={parsedTitle} name="title" defaultValue={parsedTitle} placeholder={entryType === "支出" ? "如：午餐外卖" : "如：七月工资"} required />
          </label>
          <label className="title-field">
            <span>发生时间</span>
            <input name="occurredAt" type="datetime-local" />
            <div className="quick-date-chips">
              <button type="button" onClick={() => setQuickDate(0)}>今天</button>
              <button type="button" onClick={() => setQuickDate(1)}>昨天</button>
              <button type="button" onClick={() => setQuickDate(2)}>前天</button>
            </div>
          </label>
        </div>
        <fieldset>
          <legend>{entryType === "支出" ? "扣款账户" : "入账账户"}</legend>
          <div className="account-select-grid">
            {accountList.map((item) => (
              <button
                type="button"
                className={accountId === item.id ? "selected" : ""}
                onClick={() => {
                  triggerHaptic(6);
                  onAccountChange(item.id);
                }}
                key={item.id}
              >
                <span>{item.icon}</span><small>{item.name}</small>
              </button>
            ))}
          </div>
        </fieldset>
        {entryType === "支出" && (
          <fieldset className="split-field">
            <legend>👥 是否需要分账</legend>
            <div className="split-member-row">
              <select value={splitMemberId} onChange={(event) => onSplitMemberChange(Number(event.target.value))}>
                <option value={0}>不分账 · 只记录我的收支</option>
                {memberList.filter((item) => !item.isMe).map((item) => <option value={item.id} key={item.id}>{item.icon} 与 {item.name} 分账</option>)}
              </select>
              <button type="button" onClick={() => void onAddMember()}>＋ 搭子</button>
            </div>
            {splitMemberId > 0 ? (
              <>
                <div className="split-mode-grid">
                  {([
                    { value: "全额由我支付", label: "我先垫付", hint: "对方欠我全部" },
                    { value: "全额由对方支付", label: "对方先垫付", hint: "我欠对方全部" },
                    { value: "按比例平摊", label: "我先付 · 按比例", hint: "记录双方承担比例" },
                  ] as const).map((item) => (
                    <button type="button" className={splitMode === item.value ? "selected" : ""} onClick={() => onSplitModeChange(item.value)} aria-pressed={splitMode === item.value} key={item.value}>
                      <strong>{item.label}</strong><small>{item.hint}</small>
                    </button>
                  ))}
                </div>
                {splitMode === "按比例平摊" && (
                  <label className="ratio-slider">
                    <span>我承担 <b>{mySharePercent}%</b> · 对方承担 <b>{100 - mySharePercent}%</b></span>
                    <input type="range" min="0" max="100" step="5" value={mySharePercent} onChange={(event) => onShareChange(Number(event.target.value))} />
                  </label>
                )}
                <p className="split-summary">
                  {splitMode === "全额由我支付" ? "本笔从我的账户全额扣款，并记为对方欠我全额。" : splitMode === "全额由对方支付" ? "本笔不扣我的账户，并记为我欠对方全额。" : `本笔先从我的账户全额扣款；我承担 ${mySharePercent}%，对方欠我 ${100 - mySharePercent}%。`}
                </p>
              </>
            ) : <p className="split-summary split-summary-idle">默认不产生搭子往来；选择搭子后再指定谁先付款。</p>}
          </fieldset>
        )}
        {entryType === "支出" ? (
          <>
            <fieldset>
              <legend className="category-legend"><span>消费分类</span><button type="button" onClick={onOpenCategoryManager}>⚙ 管理分类</button></legend>
              <div className="category-options">
                {categories.map((item) => <button type="button" className={`category-option ${category === item ? "selected" : ""}`} onClick={() => onCategoryChange(item)} key={item}><span>{categoryMeta[item].emoji}</span><strong>{item}</strong></button>)}
              </div>
            </fieldset>
            <fieldset>
              <legend>消费情绪</legend>
              <div className="mood-options">
                {moods.map((item) => <button type="button" className={`mood-option compact ${mood === item ? "selected" : ""}`} onClick={() => onMoodChange(item)} key={item}><span>{moodMeta[item].emoji}</span><strong>{item}</strong><small>{moodMeta[item].label}</small></button>)}
              </div>
            </fieldset>
            <label className="business-tag separated-business-tag"><input type="checkbox" name="isBusinessExpense" /><span>💼 标记为副业成本</span><small>设备、客户餐叙、店铺经营等可归入副业利润核算</small></label>
            <fieldset className="import-box">
              <legend>截图 / 文本导入 · 模拟 AI</legend>
              <input className="quick-entry-input" value={importText} onChange={(event) => onImportTextChange(event.target.value)} placeholder="一句话记账：发工资8000入账微信钱包" />
              <textarea value={importText} onChange={(event) => onImportTextChange(event.target.value)} placeholder="粘贴外卖订单，例如：美团外卖 麦当劳 实付：36.50元" />
              <label className="ocr-sandbox" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onScanReceipt(event.dataTransfer.files[0]); }}>
                {receiptUrl ? (
                  <div className="receipt-stage">
                    {/* Local blob previews cannot use the Next image optimizer. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={receiptUrl} alt="待识别收据" />
                    {scanning && <i className="scan-line" />}
                    {!scanning && <><span className="ocr-box merchant">商户 · 麦当劳</span><span className="ocr-box amount">金额 · ¥35.00</span></>}
                  </div>
                ) : <div><b>📸 智能扫描沙盒</b><span>拖拽收据图片到这里，或点击上传</span></div>}
                <input type="file" accept="image/*" onChange={(event) => onScanReceipt(event.target.files?.[0])} />
              </label>
              <button type="button" onClick={onRunParser} disabled={!importText || pending}>智能拆解金额与分类</button>
              {parsedPreview && <div className="parse-preview"><strong>✨ 已智能拆解</strong><span>{parsedPreview.type} · ¥{parsedPreview.amount} · {parsedPreview.type === "支出" ? parsedPreview.category : parsedPreview.incomeCategory}</span><span>{parsedPreview.accountName} · {parsedPreview.mood}</span><button type="button" onClick={onConfirmParsed}>确认并一键入库</button></div>}
            </fieldset>
          </>
        ) : (
          <fieldset className="income-category-field">
            <legend className="category-legend"><span>收入分类</span><button type="button" onClick={onOpenIncomeManager}>⚙ 管理分类</button></legend>
            <div className="income-options">{activeIncomeCategories.map((item) => <button type="button" className={incomeCategory === item ? "selected" : ""} onClick={() => onIncomeCategoryChange(item)} key={item}><span>{incomeMeta[item].emoji}</span><strong>{item}</strong></button>)}</div>
            {selectedIncomeCategory?.builtinKey === "理财收益" && <p className="investment-hint">选择上方“招商银行理财卡/基金账户”，收益将累计计入模拟年化回报。</p>}
            <label className="business-tag separated-business-tag"><input type="checkbox" name="isSideHustle" /><span>⚡ 标记为副业经营收益</span><small>接单、自媒体、网店或搭子分成</small></label>
          </fieldset>
        )}
        {nudgeActive && <section className="nudge-friction"><div><span>🧠</span><div><strong>温和劝导 · 深度阻尼已启动</strong><p>{threeDayImpulse ? "你已经连续 3 天记录冲动消费。" : "当前分类预算已使用超过 90%。"} 损失厌恶提醒：今天花掉的钱，也是在向未来的自己借自由。</p></div></div><label><span>请手动输入以下反思句以解锁：</span><b>{reflectionPhrase}</b><input value={reflection} onChange={(event) => onReflectionChange(event.target.value)} placeholder="慢慢输入，给大脑 5 秒钟追上手速" /></label></section>}
        <button className={`submit-button ${nudgeActive ? "damped" : ""}`} disabled={pending || (nudgeActive && reflection.trim() !== reflectionPhrase)}>{pending ? "正在联动账户…" : `保存${entryType}并更新账户`}</button>
      </form>
    </dialog>
  );
}
