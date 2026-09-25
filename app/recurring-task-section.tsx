"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { fetchClientJson } from "./client-api.ts";

export type RecurringTaskListItem = {
  id: number;
  uuid: string;
  ledgerId: number;
  name: string;
  amount: number;
  type: "支出" | "收入";
  accountId: number;
  cycle: "每天" | "每周" | "每月" | "每季" | "每年";
  category: string;
  nextRunDate: string;
  reminderDays: number;
  isPaused: boolean;
  createdAt: string;
  updatedAt: string;
};

type AccountOption = { id: number; name: string; type: "资产" | "负债"; isActive: boolean };
type Draft = { name: string; amount: string; type: "支出" | "收入"; accountId: string; cycle: RecurringTaskListItem["cycle"]; category: string; nextRunDate: string; reminderDays: string };

const cycles: RecurringTaskListItem["cycle"][] = ["每天", "每周", "每月", "每季", "每年"];
const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 });
const emptyDraft = (type: "支出" | "收入", accountId: number, category: string): Draft => ({
  name: "", amount: "", type, accountId: accountId ? String(accountId) : "", cycle: "每月", category, nextRunDate: new Date().toLocaleDateString("sv-SE"), reminderDays: "1",
});

export function RecurringTaskSection({ ledgerId, initialRows, accounts, expenseCategories, incomeCategories }: {
  ledgerId: number;
  initialRows: RecurringTaskListItem[];
  accounts: AccountOption[];
  expenseCategories: string[];
  incomeCategories: string[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const expenseAccount = accounts.find((account) => account.type === "资产" && account.isActive)?.id ?? 0;
  const loadRows = useCallback(async () => {
    const { response, data } = await fetchClientJson<RecurringTaskListItem[]>(`/api/recurring-tasks?ledger=${ledgerId}`, { cache: "no-store" });
    if (!response.ok) throw new Error("读取周期记账任务失败");
    if (Array.isArray(data)) setRows(data);
  }, [ledgerId]);

  useEffect(() => { void loadRows().catch(() => setError("暂时无法同步周期任务，请稍后重试。")); }, [loadRows]);

  const categories = draft?.type === "收入" ? incomeCategories : expenseCategories;
  function openNew() {
    const type = "支出" as const;
    setDraft(emptyDraft(type, expenseAccount, expenseCategories[0] ?? ""));
    setEditing(null);
    setError("");
    setNotice("");
  }
  function openEdit(item: RecurringTaskListItem) {
    setDraft({ name: item.name, amount: (item.amount / 100).toFixed(2), type: item.type, accountId: String(item.accountId), cycle: item.cycle, category: item.category, nextRunDate: item.nextRunDate, reminderDays: String(item.reminderDays) });
    setEditing(item.id);
    setError("");
    setNotice("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const body = { ledgerId, name: draft.name, amount: Number(draft.amount), type: draft.type, accountId: Number(draft.accountId), cycle: draft.cycle, category: draft.category, nextRunDate: draft.nextRunDate, reminderDays: Number(draft.reminderDays), ...(editing ? { id: editing } : {}) };
      const { response, data } = await fetchClientJson<{ error?: string }>("/api/recurring-tasks", { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(data?.error ?? "保存周期任务失败");
      await loadRows();
      setDraft(null);
      setEditing(null);
      setNotice(editing ? "周期任务已更新。" : "周期任务已添加。到期后会自动生成账单并更新账户。 ");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存周期任务失败，请重试。");
    } finally { setBusy(false); }
  }
  async function togglePaused(item: RecurringTaskListItem) {
    setBusy(true);
    setError("");
    try {
      const { response, data } = await fetchClientJson<{ error?: string }>("/api/recurring-tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, ledgerId, paused: !item.isPaused }) });
      if (!response.ok) throw new Error(data?.error ?? "更新任务状态失败");
      await loadRows();
      setNotice(item.isPaused ? "周期任务已恢复。" : "周期任务已暂停；暂停期间不会补记。 ");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "更新任务状态失败，请重试。"); }
    finally { setBusy(false); }
  }
  async function remove(item: RecurringTaskListItem) {
    if (confirmDelete !== item.id) { setConfirmDelete(item.id); return; }
    setBusy(true);
    setError("");
    try {
      const { response, data } = await fetchClientJson<{ error?: string }>(`/api/recurring-tasks?id=${item.id}&ledger=${ledgerId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(data?.error ?? "删除周期任务失败");
      setRows((current) => current.filter((row) => row.id !== item.id));
      setConfirmDelete(null);
      setNotice("周期任务已删除，历史流水会保留。");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "删除周期任务失败，请重试。"); }
    finally { setBusy(false); }
  }

  return <article className="subscription-section recurring-task-section">
    <div className="section-heading account-heading"><div><p className="eyebrow">RECURRING TASKS</p><h2>周期记账</h2></div><button className="new-account-button" onClick={openNew} disabled={busy}>＋ 添加规则</button></div>
    <p className="recurring-task-explainer">适合房租、薪资、固定储蓄等重复收支。每次到期会按规则生成账单并更新账户余额；暂停期间不补记。</p>
    {notice && <p className="recurring-task-notice" role="status">{notice}</p>}
    {error && <p className="recurring-task-error" role="alert">{error}</p>}
    {draft && <form className="recurring-task-editor" onSubmit={save}>
      <div className="recurring-task-editor-head"><strong>{editing ? "编辑周期规则" : "新建周期规则"}</strong><button type="button" aria-label="关闭周期任务编辑" onClick={() => { setDraft(null); setEditing(null); }}>×</button></div>
      <label>名称<input maxLength={40} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：每月房租" required /></label>
      <div className="two-fields">
        <label>类型<select value={draft.type} onChange={(event) => { const type = event.target.value as "支出" | "收入"; const nextCategories = type === "收入" ? incomeCategories : expenseCategories; setDraft({ ...draft, type, category: nextCategories[0] ?? "" }); }}><option>支出</option><option>收入</option></select></label>
        <label>金额<input type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} required /></label>
      </div>
      <div className="two-fields">
        <label>账户<select value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })} required><option value="">选择资产账户</option>{accounts.filter((account) => account.type === "资产" && account.isActive).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label>分类<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} required>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      </div>
      <div className="two-fields">
        <label>重复周期<select value={draft.cycle} onChange={(event) => setDraft({ ...draft, cycle: event.target.value as Draft["cycle"] })}>{cycles.map((cycle) => <option key={cycle}>{cycle}</option>)}</select></label>
        <label>首次执行日<input type="date" value={draft.nextRunDate} onChange={(event) => setDraft({ ...draft, nextRunDate: event.target.value })} required /></label>
      </div>
      <label>提前提醒<select value={draft.reminderDays} onChange={(event) => setDraft({ ...draft, reminderDays: event.target.value })}><option value="0">不提醒</option>{[1, 3, 7, 14, 30].map((days) => <option key={days} value={days}>提前 {days} 天</option>)}</select></label>
      <div className="recurring-task-editor-actions"><button type="button" onClick={() => { setDraft(null); setEditing(null); }}>取消</button><button className="submit-button" disabled={busy || !accounts.some((account) => account.type === "资产" && account.isActive) || !categories.length}>{busy ? "保存中…" : "保存规则"}</button></div>
    </form>}
    <div className="subscription-list recurring-task-list">{rows.length ? rows.map((item) => <article key={item.id} className={item.isPaused ? "recurring-task-paused" : ""}>
      <span>{item.type === "收入" ? "↙" : "↗"}</span>
      <div className="subscription-info"><strong>{item.name}{item.isPaused && <em className="subscription-paused-label">已暂停</em>}</strong><small>{item.cycle} · {item.category} · 下次 {item.nextRunDate.replaceAll("-", ".")} · {item.reminderDays ? `提前 ${item.reminderDays} 天提醒` : "不提醒"}</small></div>
      <div className="subscription-cost"><b>{money.format(item.amount / 100)}</b><em>{accounts.find((account) => account.id === item.accountId)?.name ?? "账户不可用"}</em></div>
      <div className="subscription-actions"><button aria-label={item.isPaused ? `恢复${item.name}` : `暂停${item.name}`} title={item.isPaused ? "恢复规则" : "暂停规则"} onClick={() => void togglePaused(item)} disabled={busy}>{item.isPaused ? "▶" : "Ⅱ"}</button><button aria-label={`修改${item.name}`} title="修改规则" onClick={() => openEdit(item)} disabled={busy}>✎</button>{confirmDelete === item.id ? <><button aria-label={`确认删除${item.name}`} onClick={() => void remove(item)} disabled={busy}>确认</button><button aria-label="取消删除" onClick={() => setConfirmDelete(null)}>取消</button></> : <button aria-label={`删除${item.name}`} title="删除规则" onClick={() => void remove(item)} disabled={busy}>×</button>}</div>
    </article>) : <p className="subscription-empty">还没有周期规则。固定收支可以设为自动记账，临时账单仍可逐笔记录。</p>}</div>
  </article>;
}
