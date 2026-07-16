"use client";

import Script from "next/script";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  parseStatementFiles,
  type ParsedStatementItem,
} from "./bill-file-parser";
import { mergeSyncSnapshots } from "./sync-merge.js";

type Mood = "悦己" | "刚需" | "冲动";
type Category = string;
type IncomeCategory = string;
type TransactionType = "支出" | "收入";
type Dimension = "日" | "月" | "年";
type BillRange =
  | "all"
  | "day"
  | "week"
  | "month"
  | "year"
  | "other-year"
  | "custom";
type Transaction = {
  id: number;
  title: string;
  amount: number;
  type: TransactionType;
  mood: Mood | null;
  category: Category | null;
  incomeCategory: IncomeCategory | null;
  accountId: number;
  paymentAccountId: number | null;
  paidByMemberId: number | null;
  splitWithMemberId: number | null;
  splitMode:
    "全额由我支付" | "全额由对方支付" | "按比例平摊" | "人情平账" | null;
  mySharePercent: number;
  currency: Currency;
  installmentId: number | null;
  installmentNumber: number | null;
  isSideHustle: boolean;
  occurredAt: string;
  createdAt: string;
};
type Account = {
  id: number;
  name: string;
  type: "资产" | "负债";
  currentBalance: number;
  billDay: number | null;
  repaymentDay: number | null;
  icon: string;
  isInvestment: boolean;
  initialBalance: number;
  cumulativeIncome: number;
  currency: Currency;
  assetClass: "现金流" | "固收防守" | "风险进攻";
  createdAt: string;
};
type CategoryBudget = { category: Category; amount: number; updatedAt: string };
type Subscription = {
  id: number;
  name: string;
  amount: number;
  accountId: number;
  cycle: "每月" | "每季" | "每年";
  category: Category;
  nextChargeDate: string;
  createdAt: string;
};
type Ledger = { id: number; name: string; icon: string; createdAt: string };
type SavingsGoal = {
  id: number;
  ledgerId: number;
  name: string;
  targetAmount: number;
  savedAmount: number;
  deadline: string;
  icon: string;
  createdAt: string;
};
type ParsedEntry = {
  amount: string;
  category: Category;
  title: string;
  type: TransactionType;
  incomeCategory: IncomeCategory;
  mood: Mood;
  accountId: number;
  accountName: string;
};
type ThemeName = "cream" | "obsidian" | "glacier" | "peach";
type Currency = "CNY" | "USD" | "JPY" | "EUR";
type Member = {
  id: number;
  ledgerId: number;
  name: string;
  icon: string;
  isMe: boolean;
  createdAt: string;
};
type Forecast = {
  netWorth: number;
  averageDailySpend: number;
  monthlyFixed: number;
  bankruptcyDate: string | null;
  runwayDays: number;
  points: { label: string; date: string; balance: number; danger: boolean }[];
};
type Installment = {
  id: number;
  ledgerId: number;
  name: string;
  totalAmount: number;
  periods: number;
  paidPeriods: number;
  feeAmount: number;
  accountId: number;
  startMonth: string;
  chargeDay: number;
  currency: Currency;
  createdAt: string;
};
type DigitalAsset = {
  id: number;
  ledgerId: number;
  name: string;
  assetType: "数码设备" | "游戏账号" | "潮流玩具";
  purchasePrice: number;
  purchaseDate: string;
  lifespanMonths: number;
  residualRateBps: number;
  heatLevel: "高" | "中" | "低" | null;
  createdAt: string;
  elapsedMonths: number;
  currentValue: number;
  residualValue: number;
  valueLost: number;
  lossPercent: number;
  dailyDepreciation: number;
  heatLambda: number;
};
type Achievement = { ledgerId: number; code: string; unlockedAt: string };
type BadgeTier = "普通" | "稀有" | "史诗" | "隐藏";
type BadgeDefinition = {
  code: string;
  icon: string;
  name: string;
  desc: string;
  tier: BadgeTier;
};
const badgeTierRank: Record<BadgeTier, number> = {
  普通: 1,
  稀有: 2,
  史诗: 3,
  隐藏: 4,
};
const badgeTierClass: Record<BadgeTier, string> = {
  普通: "common",
  稀有: "rare",
  史诗: "epic",
  隐藏: "hidden",
};
const badgeDefinitions: BadgeDefinition[] = [
  {
    code: "first_spark",
    icon: "✍️",
    name: "第一笔星火",
    desc: "完成账本中的第一笔记录",
    tier: "普通",
  },
  {
    code: "income_scout",
    icon: "🧧",
    name: "开源侦察兵",
    desc: "记录人生第一笔收入",
    tier: "普通",
  },
  {
    code: "account_architect",
    icon: "🏦",
    name: "账户建筑师",
    desc: "建立至少 3 个资金账户",
    tier: "普通",
  },
  {
    code: "seven_day_scribe",
    icon: "🗓️",
    name: "七日记账官",
    desc: "近 30 天内有 7 天完成记账",
    tier: "普通",
  },
  {
    code: "positive_month",
    icon: "🌱",
    name: "月度正循环",
    desc: "本月收入高于支出",
    tier: "普通",
  },
  {
    code: "dream_planter",
    icon: "🌟",
    name: "心愿播种者",
    desc: "建立第一个心愿储蓄目标",
    tier: "普通",
  },
  {
    code: "coffee_knight",
    icon: "☕",
    name: "咖啡断奶骑士",
    desc: "连续 7 天咖啡支出为 0",
    tier: "稀有",
  },
  {
    code: "ledger_regular",
    icon: "📚",
    name: "账本常驻民",
    desc: "累计完成 50 笔收支记录",
    tier: "稀有",
  },
  {
    code: "century_club",
    icon: "💯",
    name: "百笔俱乐部",
    desc: "累计完成 100 笔收支记录",
    tier: "稀有",
  },
  {
    code: "income_diversifier",
    icon: "🌈",
    name: "收入多栖玩家",
    desc: "点亮至少 3 种收入来源",
    tier: "稀有",
  },
  {
    code: "budget_guardian",
    icon: "🧭",
    name: "预算守门人",
    desc: "本月有消费且总支出未超预算",
    tier: "稀有",
  },
  {
    code: "mindful_week",
    icon: "🧘",
    name: "清醒消费一周",
    desc: "近 7 天有记账且零冲动消费",
    tier: "稀有",
  },
  {
    code: "category_explorer",
    icon: "🗺️",
    name: "消费地图家",
    desc: "记录过至少 5 个支出分类",
    tier: "稀有",
  },
  {
    code: "side_hustle_starter",
    icon: "💼",
    name: "副业启航者",
    desc: "记录第一笔副业收入",
    tier: "稀有",
  },
  {
    code: "investor_awakened",
    icon: "📈",
    name: "投资意识觉醒",
    desc: "建立第一个投资账户",
    tier: "稀有",
  },
  {
    code: "digital_curator",
    icon: "💻",
    name: "数字资产馆长",
    desc: "管理至少 3 件数码或虚拟资产",
    tier: "稀有",
  },
  {
    code: "frugal_week",
    icon: "🪶",
    name: "轻盈消费周",
    desc: "近 7 天有记账且支出不超过 ¥100",
    tier: "稀有",
  },
  {
    code: "temptation_fighter",
    icon: "🛡️",
    name: "抗住诱惑反击者",
    desc: "月过半且冲动消费为 0",
    tier: "史诗",
  },
  {
    code: "full_revive",
    icon: "🔥",
    name: "满血复活",
    desc: "近 30 天每天都完成记账",
    tier: "史诗",
  },
  {
    code: "savings_pilot",
    icon: "🚀",
    name: "储蓄率飞行员",
    desc: "本月储蓄率达到 20%",
    tier: "史诗",
  },
  {
    code: "super_saver",
    icon: "💎",
    name: "半数收入守护者",
    desc: "本月储蓄率达到 50%",
    tier: "史诗",
  },
  {
    code: "debt_tamer",
    icon: "🕊️",
    name: "负债驯服者",
    desc: "成功清偿至少一个负债账户",
    tier: "史诗",
  },
  {
    code: "wish_fulfilled",
    icon: "🎆",
    name: "心愿兑现家",
    desc: "完成至少一个心愿储蓄目标",
    tier: "史诗",
  },
  {
    code: "ledger_legend",
    icon: "🏛️",
    name: "账本编年史",
    desc: "累计完成 365 笔收支记录",
    tier: "史诗",
  },
  {
    code: "debt_free_hidden",
    icon: "🪽",
    name: "无债之翼",
    desc: "将名下所有负债账户全部清零",
    tier: "隐藏",
  },
  {
    code: "dawn_bookkeeper",
    icon: "🌅",
    name: "破晓记账人",
    desc: "在清晨 05:00–08:00 完成一笔记录",
    tier: "隐藏",
  },
  {
    code: "midnight_witness",
    icon: "🌌",
    name: "午夜账本见证者",
    desc: "在午夜 00:00–05:00 完成一笔记录",
    tier: "隐藏",
  },
];
type Deduction = {
  id: number;
  ledgerId: number;
  transactionId: number;
  amount: number;
  note: string;
  createdAt: string;
};
type ImportedBill = ParsedStatementItem & {
  accountId: number;
  accountName: string;
  importKey: string;
  possibleDuplicate?: boolean;
};
type BillImportSummary = {
  fileName: string;
  sourceName: string;
  detected: number;
  ready: number;
  skipped: number;
  duplicates: number;
  possibleDuplicates: number;
  unmapped: number;
  totalRows: number;
  filtered: number;
  unconfirmed: number;
  truncated: number;
  files: {
    fileName: string;
    totalRows: number;
    success: number;
    filtered: number;
    unconfirmed: number;
    truncated: number;
  }[];
};
type AppUpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  tag: string | null;
  available: boolean;
  releaseName: string;
  notes: string;
  publishedAt: string | null;
  releaseUrl: string;
  canApply: boolean;
};
type PendingFlow = {
  id: number;
  rawText: string;
  title: string;
  amount: number;
  type: "支出" | "收入";
  accountId: number;
  accountName: string;
  currency: Currency;
  occurredAt: string;
  status: string;
  createdAt: string;
};
type SystemNotice = {
  id: number;
  title: string;
  message: string;
  read: number | boolean;
  createdAt: string;
};
type PeriodSummary = {
  income: number;
  expense: number;
  balance: number;
  count: number;
  topCategory: string | null;
  topCategoryAmount: number;
};
type FireSetting = {
  ledgerId: number;
  monthlyExpense: number;
  annualReturnBps: number;
  updatedAt: string;
};
type EconomicSetting = {
  ledgerId: number;
  inflationBps: number;
  updatedAt: string;
};
type ExpenseCategory = {
  id: number;
  ledgerId: number;
  name: string;
  icon: string;
  color: string;
  builtinKey: string | null;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
};
type ChatMessage = { role: "user" | "assistant"; content: string };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type ChartInstance = { destroy: () => void };
type ChartConstructor = new (
  context: CanvasRenderingContext2D,
  config: object,
) => ChartInstance;

declare global {
  interface Window {
    Chart?: ChartConstructor;
  }
}

const moods: Mood[] = ["悦己", "刚需", "冲动"];
const fallbackCategoryMeta: Record<
  string,
  { emoji: string; color: string }
> = {
  餐饮: { emoji: "🍔", color: "#e98565" },
  交通: { emoji: "🚇", color: "#84a28d" },
  购物: { emoji: "🛍️", color: "#c98fa7" },
  咖啡: { emoji: "☕", color: "#ae8566" },
  娱乐: { emoji: "🎮", color: "#858cbd" },
};
const moodMeta: Record<Mood, { emoji: string; label: string; color: string }> =
  {
    悦己: { emoji: "🥰", label: "悦己消费", color: "#e98565" },
    刚需: { emoji: "😭", label: "刚需打工", color: "#94aa86" },
    冲动: { emoji: "💸", label: "冲动大怨种", color: "#e6b653" },
  };
const fallbackIncomeMeta: Record<
  string,
  { emoji: string; color: string }
> = {
  薪资发放: { emoji: "💼", color: "#4f9b78" },
  理财收益: { emoji: "📈", color: "#78b899" },
  兼职外快: { emoji: "🧧", color: "#d19a5d" },
  其它收入: { emoji: "🎁", color: "#8f91b8" },
};
const money = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
});
const currencySymbol: Record<Currency, string> = {
  CNY: "¥",
  USD: "$",
  JPY: "¥",
  EUR: "€",
};
const formatCurrency = (amount: number, currency: Currency) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(amount);
const toDate = (value: string) =>
  new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const offlineDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("neo-ledger-offline", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("entries", { keyPath: "offlineId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
async function offlinePut(value: Record<string, unknown>) {
  const db = await offlineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("entries", "readwrite");
    tx.objectStore("entries").put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function offlineList() {
  const db = await offlineDb();
  const rows = await new Promise<Record<string, unknown>[]>(
    (resolve, reject) => {
      const request = db.transaction("entries").objectStore("entries").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    },
  );
  db.close();
  return rows;
}
async function offlineDelete(ids: string[]) {
  const db = await offlineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("entries", "readwrite");
    ids.forEach((id) => tx.objectStore("entries").delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
const bytesToBase64 = (bytes: Uint8Array) => {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
};
const base64ToBytes = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
async function deriveSyncKey(secret: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function encryptSyncPayload(value: unknown, secret: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    key = await deriveSyncKey(secret, salt),
    cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    );
  return JSON.stringify({
    version: 1,
    algorithm: "AES-256-GCM",
    kdf: "PBKDF2-SHA256-250000",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipher)),
  });
}
async function decryptSyncPayload(payload: string, secret: string) {
  const box = JSON.parse(payload) as {
      salt: string;
      iv: string;
      ciphertext: string;
    },
    key = await deriveSyncKey(secret, base64ToBytes(box.salt)),
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(box.iv) },
      key,
      base64ToBytes(box.ciphertext),
    );
  return JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
}

export function LedgerApp({
  transactions,
  accounts,
  budget,
  categoryBudgets,
  subscriptions,
  ledgers,
  currentLedgerId,
  savingsGoals,
  members,
  installments,
  achievements,
  exchangeRates,
  deductions,
  fireSetting,
  economicSetting,
  digitalAssets,
  expenseCategories,
  incomeCategories,
  initialTheme,
  lockEnabled,
  addTransaction,
  deleteTransaction,
  updateBudget,
  parseImportText,
}: {
  transactions: Transaction[];
  accounts: Account[];
  budget: number;
  categoryBudgets: CategoryBudget[];
  subscriptions: Subscription[];
  ledgers: Ledger[];
  currentLedgerId: number;
  savingsGoals: SavingsGoal[];
  members: Member[];
  installments: Installment[];
  achievements: Achievement[];
  exchangeRates: Record<Currency, number>;
  deductions: Deduction[];
  fireSetting: FireSetting;
  economicSetting: EconomicSetting;
  digitalAssets: DigitalAsset[];
  expenseCategories: ExpenseCategory[];
  incomeCategories: ExpenseCategory[];
  initialTheme: ThemeName;
  lockEnabled: boolean;
  addTransaction: (formData: FormData) => Promise<void>;
  deleteTransaction: (id: number) => Promise<{ ok: boolean; error?: string }>;
  updateBudget: (formData: FormData) => Promise<void>;
  parseImportText: (text: string, ledgerId: number) => Promise<ParsedEntry>;
}) {
  const [tab, setTab] = useState<
    "dashboard" | "assets" | "bills" | "planning" | "analytics"
  >("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [clockTick, setClockTick] = useState(0);
  const [billQuery, setBillQuery] = useState("");
  const [billRange, setBillRange] = useState<BillRange>("all");
  const [billYear, setBillYear] = useState("");
  const [billStartDate, setBillStartDate] = useState("");
  const [billEndDate, setBillEndDate] = useState("");
  const [dimension, setDimension] = useState<Dimension>("月");
  const [todayKey, setTodayKey] = useState("");
  const [dateLabels, setDateLabels] = useState<Record<number, string>>({});
  const buildDateLabels = () =>
    Object.fromEntries(
        transactions.map((item) => [
          item.id,
          new Intl.DateTimeFormat("zh-CN", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(toDate(item.occurredAt)),
        ]),
      );
  const [entryOpen, setEntryOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [accountList, setAccountList] = useState(accounts);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountType, setAccountType] = useState<"资产" | "负债">("资产");
  const [accountError, setAccountError] = useState("");
  const [toast, setToast] = useState<{
    kind: "warning" | "success";
    message: string;
  } | null>(null);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] =
    useState<Subscription | null>(null);
  const [subscriptionError, setSubscriptionError] = useState("");
  const [subscriptionCategory, setSubscriptionCategory] = useState("");
  const [subscriptionCategoryOpen, setSubscriptionCategoryOpen] =
    useState(false);
  const [subscriptionCategoryError, setSubscriptionCategoryError] =
    useState("");
  const [subscriptionCategoryDraft, setSubscriptionCategoryDraft] = useState({
    name: "",
    icon: "📦",
    color: "#8f91b8",
  });
  const [dataOpen, setDataOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateApplying, setUpdateApplying] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [ledgerMenuOpen, setLedgerMenuOpen] = useState(false);
  const [subscriptionList, setSubscriptionList] = useState(subscriptions);
  const [categoryBudgetList, setCategoryBudgetList] = useState(categoryBudgets);
  const [categoryList, setCategoryList] = useState(expenseCategories);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<ExpenseCategory | null>(null);
  const [categoryError, setCategoryError] = useState("");
  const [incomeCategoryList, setIncomeCategoryList] = useState(incomeCategories);
  const [incomeManagerOpen, setIncomeManagerOpen] = useState(false);
  const [editingIncomeCategory, setEditingIncomeCategory] =
    useState<ExpenseCategory | null>(null);
  const [incomeCategoryError, setIncomeCategoryError] = useState("");
  const [entryType, setEntryType] = useState<TransactionType>("支出");
  const [reflection, setReflection] = useState("");
  const [mood, setMood] = useState<Mood>("刚需");
  const [category, setCategory] = useState<Category>(
    expenseCategories.find((item) => item.isActive)?.name ?? "餐饮",
  );
  const [incomeCategory, setIncomeCategory] =
    useState<IncomeCategory>(
      incomeCategories.find((item) => item.isActive)?.name ?? "薪资发放",
    );
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? 0);
  const [importText, setImportText] = useState("");
  const [parsedAmount, setParsedAmount] = useState("");
  const [parsedTitle, setParsedTitle] = useState("");
  const [parsedPreview, setParsedPreview] = useState<ParsedEntry | null>(null);
  const [goalList, setGoalList] = useState(savingsGoals);
  const [goalOpen, setGoalOpen] = useState(false);
  const [savingGoal, setSavingGoal] = useState<SavingsGoal | null>(null);
  const [goalError, setGoalError] = useState("");
  const [theme, setTheme] = useState<ThemeName>(initialTheme);
  const [aestheticOpen, setAestheticOpen] = useState(false);
  const [locked, setLocked] = useState(lockEnabled);
  const [securityEnabled, setSecurityEnabled] = useState(lockEnabled);
  const [pin, setPin] = useState("");
  const [lockError, setLockError] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [memberList, setMemberList] = useState(members);
  const [installmentList] = useState(installments);
  const [installmentOpen, setInstallmentOpen] = useState(false);
  const [digitalAssetList, setDigitalAssetList] = useState(digitalAssets);
  const [assetOpen, setAssetOpen] = useState(false);
  const [assetType, setAssetType] = useState<DigitalAsset["assetType"]>(
    "数码设备",
  );
  const [assetError, setAssetError] = useState("");
  const [liquidatingAsset, setLiquidatingAsset] =
    useState<DigitalAsset | null>(null);
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [badgeFocusCode, setBadgeFocusCode] = useState<string | null>(null);
  const [billImportItems, setBillImportItems] = useState<ImportedBill[]>([]);
  const [billImportError, setBillImportError] = useState("");
  const [billImportStatus, setBillImportStatus] = useState("");
  const [billImportSummary, setBillImportSummary] =
    useState<BillImportSummary | null>(null);
  const [stressEvents, setStressEvents] = useState({
    unemployment: false,
    crash: false,
    emergency: false,
  });
  const [pendingFlows, setPendingFlows] = useState<PendingFlow[]>([]);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );
  const [offlineCount, setOfflineCount] = useState(0);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [systemNotices, setSystemNotices] = useState<SystemNotice[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "晚上好，我已经读完你的聚合财务摘要。可以问我：哪笔钱花得最冤，或者按现在速度多久能买 Mac？",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [fireConfig, setFireConfig] = useState(fireSetting);
  const [syncStatus, setSyncStatus] = useState("尚未同步");
  const [syncing, setSyncing] = useState(false);
  const [webdavConfig] = useState(() => {
    if (typeof window === "undefined") return { url: "", username: "" };
    try {
      const saved = JSON.parse(
        localStorage.getItem("neo-webdav-config") || "{}",
      ) as { url?: string; username?: string };
      return { url: saved.url || "", username: saved.username || "" };
    } catch {
      return { url: "", username: "" };
    }
  });
  const [inflationConfig, setInflationConfig] = useState(economicSetting);
  const [p2pRoom, setP2pRoom] = useState("neo-home");
  const [p2pNode] = useState(() => {
    if (typeof window === "undefined") return "";
    const saved =
      localStorage.getItem("neo-p2p-node") ||
      `node-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem("neo-p2p-node", saved);
    return saved;
  });
  const [p2pTarget, setP2pTarget] = useState("");
  const [p2pStatus, setP2pStatus] = useState("等待局域网节点");
  const [splitMode, setSplitMode] = useState<
    "全额由我支付" | "全额由对方支付" | "按比例平摊"
  >("全额由我支付");
  const [splitMemberId, setSplitMemberId] = useState(
    members.find((item) => !item.isMe)?.id ?? 0,
  );
  const [mySharePercent, setMySharePercent] = useState(50);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [pending, startTransition] = useTransition();
  const entryRef = useRef<HTMLDialogElement>(null);
  const budgetRef = useRef<HTMLDialogElement>(null);
  const accountRef = useRef<HTMLDialogElement>(null);
  const transferRef = useRef<HTMLDialogElement>(null);
  const subscriptionRef = useRef<HTMLDialogElement>(null);
  const dataRef = useRef<HTMLDialogElement>(null);
  const noticeRef = useRef<HTMLDialogElement>(null);
  const ledgerMenuRef = useRef<HTMLDialogElement>(null);
  const goalRef = useRef<HTMLDialogElement>(null);
  const aestheticRef = useRef<HTMLDialogElement>(null);
  const installmentRef = useRef<HTMLDialogElement>(null);
  const assetRef = useRef<HTMLDialogElement>(null);
  const liquidationRef = useRef<HTMLDialogElement>(null);
  const categoryManagerRef = useRef<HTMLDialogElement>(null);
  const incomeManagerRef = useRef<HTMLDialogElement>(null);
  const badgeRef = useRef<HTMLDialogElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const signalCursorRef = useRef(0);
  const pieCanvas = useRef<HTMLCanvasElement>(null);
  const moodCanvas = useRef<HTMLCanvasElement>(null);
  const lineCanvas = useRef<HTMLCanvasElement>(null);
  const forecastCanvas = useRef<HTMLCanvasElement>(null);

  const categories = useMemo(
    () => categoryList.filter((item) => item.isActive).map((item) => item.name),
    [categoryList],
  );
  const allCategoryNames = useMemo(
    () => categoryList.map((item) => item.name),
    [categoryList],
  );
  const categoryMeta = useMemo(() => {
    const configured = Object.fromEntries(
      categoryList.map((item) => [
        item.name,
        { emoji: item.icon, color: item.color },
      ]),
    ) as Record<string, { emoji: string; color: string }>;
    return new Proxy(configured, {
      get(target, key: string) {
        return (
          target[key] ??
          fallbackCategoryMeta[key] ?? { emoji: "📦", color: "#8f91b8" }
        );
      },
    });
  }, [categoryList]);
  const activeIncomeCategories = useMemo(
    () =>
      incomeCategoryList.filter((item) => item.isActive).map((item) => item.name),
    [incomeCategoryList],
  );
  const allIncomeCategoryNames = useMemo(
    () => incomeCategoryList.map((item) => item.name),
    [incomeCategoryList],
  );
  const incomeMeta = useMemo(() => {
    const configured = Object.fromEntries(
      incomeCategoryList.map((item) => [
        item.name,
        { emoji: item.icon, color: item.color },
      ]),
    ) as Record<string, { emoji: string; color: string }>;
    return new Proxy(configured, {
      get(target, key: string) {
        return (
          target[key] ??
          fallbackIncomeMeta[key] ?? { emoji: "💰", color: "#78a98c" }
        );
      },
    });
  }, [incomeCategoryList]);
  const refreshTransactionView = useEffectEvent(() => {
    void reloadAccounts();
    setDateLabels(buildDateLabels());
  });
  const reloadPendingFlowsEffect = useEffectEvent(reloadPendingFlows);
  const syncOfflineEntriesEffect = useEffectEvent(syncOfflineEntries);
  const handlePeerSignalEffect = useEffectEvent(handlePeerSignal);
  const checkAppUpdateEffect = useEffectEvent(checkAppUpdate);

  useEffect(() => {
    const frame = window.requestAnimationFrame(refreshTransactionView);
    return () => window.cancelAnimationFrame(frame);
  }, [transactions]);
  useEffect(() => {
    const updateClock = () => {
      const now = Date.now();
      setClockTick(now);
      setTodayKey(toLocalDateKey(new Date(now)));
    };
    const frame = window.requestAnimationFrame(updateClock);
    const timer = window.setInterval(updateClock, 60_000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const isLocalPreview = ["localhost", "127.0.0.1", "::1"].includes(
        window.location.hostname,
      );
      if (isLocalPreview) {
        // Vite serves the same CSS URL differently for module imports and
        // stylesheet requests. An old cache-first worker could retain the JS
        // variant and make the whole page appear unstyled during development.
        void Promise.all([
          navigator.serviceWorker
            .getRegistrations()
            .then((items) => Promise.all(items.map((item) => item.unregister()))),
          "caches" in window
            ? caches
                .keys()
                .then((keys) =>
                  Promise.all(
                    keys
                      .filter((key) => key.startsWith("neo-ledger-"))
                      .map((key) => caches.delete(key)),
                  ),
                )
            : Promise.resolve([]),
        ]).then(() => {
          const cleanupKey = "neo-ledger-local-cache-cleaned-v6";
          if (!sessionStorage.getItem(cleanupKey)) {
            sessionStorage.setItem(cleanupKey, "1");
            window.location.reload();
          }
        });
      } else {
        void navigator.serviceWorker.register("/service-worker.js", {
          updateViaCache: "none",
        });
      }
    }
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", capture);
    void offlineList().then((rows) => setOfflineCount(rows.length));
    void reloadPendingFlowsEffect();
    const online = () => {
        setIsOnline(true);
        void syncOfflineEntriesEffect();
      },
      offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    if (navigator.onLine) void syncOfflineEntriesEffect();
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [currentLedgerId]);
  useEffect(() => {
    if (!noticeOpen) return;
    void reloadPendingFlowsEffect();
    const timer = window.setInterval(() => void reloadPendingFlowsEffect(), 3000);
    const refresh = () => void reloadPendingFlowsEffect();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [noticeOpen, currentLedgerId]);
  useEffect(() => {
    if (dataOpen && !updateInfo) void checkAppUpdateEffect();
  }, [dataOpen, updateInfo]);
  useEffect(() => {
    if (!dataOpen || !p2pNode || !p2pRoom) return;
    const poll = async () => {
      const response = await fetch(
        `/api/p2p/signals?room=${encodeURIComponent(p2pRoom)}&node=${encodeURIComponent(p2pNode)}&after=${signalCursorRef.current}`,
        { cache: "no-store" },
      );
      if (response.ok) {
        const rows = (await response.json()) as {
          id: number;
          fromNode: string;
          kind: string;
          payload: string;
        }[];
        for (const row of rows) await handlePeerSignalEffect(row);
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => window.clearInterval(timer);
  }, [dataOpen, p2pNode, p2pRoom]);
  useEffect(() => {
    if (tab !== "assets" || !todayKey || locked) return;
    const unlocked = badgeDefinitions
      .filter((badge) =>
        achievements.some((item) => item.code === badge.code),
      )
      .sort((a, b) => {
        const tierDifference = badgeTierRank[b.tier] - badgeTierRank[a.tier];
        if (tierDifference) return tierDifference;
        const unlockedAt = (code: string) =>
          achievements.find((item) => item.code === code)?.unlockedAt ?? "";
        return unlockedAt(b.code).localeCompare(unlockedAt(a.code));
      });
    if (!unlocked.length) return;
    const key = `neo-badges-daily-v2-${currentLedgerId}`;
    if (localStorage.getItem(key) === todayKey) return;
    localStorage.setItem(key, todayKey);
    const frame = window.requestAnimationFrame(() => {
      setBadgeFocusCode(unlocked[0].code);
      openDialog(badgeRef, setBadgeOpen);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tab, todayKey, currentLedgerId, locked, achievements]);

  useEffect(() => {
    if (tab !== "analytics") return;
    void fetch(`/api/forecast?ledger=${currentLedgerId}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Forecast | null) => setForecast(data));
  }, [tab, currentLedgerId, transactions, subscriptions]);

  async function reloadAccounts() {
    const response = await fetch(`/api/accounts?ledger=${currentLedgerId}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const rows = (await response.json()) as Account[];
    setAccountList(rows);
    setAccountId((current) =>
      rows.some((item) => item.id === current) ? current : (rows[0]?.id ?? 0),
    );
  }
  async function reloadGoals() {
    const response = await fetch(
      `/api/savings-goals?ledger=${currentLedgerId}`,
      { cache: "no-store" },
    );
    if (response.ok) setGoalList((await response.json()) as SavingsGoal[]);
  }
  async function reloadSubscriptions() {
    const response = await fetch(
      `/api/subscriptions?ledger=${currentLedgerId}`,
      { cache: "no-store" },
    );
    if (response.ok)
      setSubscriptionList((await response.json()) as Subscription[]);
  }
  async function reloadDigitalAssets() {
    const response = await fetch(`/api/assets?ledger=${currentLedgerId}`, {
      cache: "no-store",
    });
    if (response.ok)
      setDigitalAssetList((await response.json()) as DigitalAsset[]);
  }
  async function reloadCategories() {
    const [categoryResponse, budgetResponse] = await Promise.all([
      fetch(`/api/categories?ledger=${currentLedgerId}`, { cache: "no-store" }),
      fetch(`/api/category-budgets?ledger=${currentLedgerId}`, {
        cache: "no-store",
      }),
    ]);
    if (categoryResponse.ok) {
      const rows = (await categoryResponse.json()) as ExpenseCategory[];
      setCategoryList(rows);
      const activeNames = rows.filter((item) => item.isActive).map((item) => item.name);
      setCategory((current) =>
        activeNames.includes(current) ? current : (activeNames[0] ?? "餐饮"),
      );
    }
    if (budgetResponse.ok)
      setCategoryBudgetList((await budgetResponse.json()) as CategoryBudget[]);
  }
  async function reloadIncomeCategories() {
    const response = await fetch(
      `/api/income-categories?ledger=${currentLedgerId}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const rows = (await response.json()) as ExpenseCategory[];
    setIncomeCategoryList(rows);
    const activeNames = rows
      .filter((item) => item.isActive)
      .map((item) => item.name);
    setIncomeCategory((current) =>
      activeNames.includes(current) ? current : (activeNames[0] ?? "薪资发放"),
    );
  }
  async function reloadPendingFlows() {
    const [pendingResponse, noticeResponse] = await Promise.all([
      fetch(`/api/pending-transactions?ledger=${currentLedgerId}`, {
        cache: "no-store",
      }),
      fetch(`/api/notifications?ledger=${currentLedgerId}`, {
        cache: "no-store",
      }),
    ]);
    if (pendingResponse.ok)
      setPendingFlows((await pendingResponse.json()) as PendingFlow[]);
    if (noticeResponse.ok)
      setSystemNotices((await noticeResponse.json()) as SystemNotice[]);
  }
  async function syncOfflineEntries() {
    if (!navigator.onLine) return;
    const items = await offlineList();
    if (!items.length) {
      setOfflineCount(0);
      return;
    }
    const response = await fetch("/api/offline-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (response.ok) {
      const result = (await response.json()) as { synced: string[] };
      await offlineDelete(result.synced);
      const remaining = await offlineList();
      setOfflineCount(remaining.length);
      if (result.synced.length) window.location.reload();
    }
  }

  const analysis = useMemo(() => {
    const anchor = todayKey ? new Date(`${todayKey}T12:00:00`) : null;
    const filtered = transactions.filter((item) => {
      if (!anchor) return true;
      const date = toDate(item.occurredAt);
      if (dimension === "日")
        return (
          date.getFullYear() === anchor.getFullYear() &&
          date.getMonth() === anchor.getMonth() &&
          date.getDate() === anchor.getDate()
        );
      if (dimension === "月")
        return (
          date.getFullYear() === anchor.getFullYear() &&
          date.getMonth() === anchor.getMonth()
        );
      return date.getFullYear() === anchor.getFullYear();
    });
    const expenseRows = filtered.filter((item) => item.type === "支出");
    const incomeRows = filtered.filter((item) => item.type === "收入");
    const expenseTotal = expenseRows.reduce(
      (sum, item) => sum + item.amount * exchangeRates[item.currency],
      0,
    );
    const incomeTotal = incomeRows.reduce(
      (sum, item) => sum + item.amount * exchangeRates[item.currency],
      0,
    );
    const categoryData = allCategoryNames.map((name) => ({
      name,
      amount: expenseRows
        .filter((item) => item.category === name)
        .reduce(
          (sum, item) => sum + item.amount * exchangeRates[item.currency],
          0,
        ),
    }));
    const moodData = moods.map((name) => ({
      name,
      amount: expenseRows
        .filter((item) => item.mood === name)
        .reduce(
          (sum, item) => sum + item.amount * exchangeRates[item.currency],
          0,
        ),
    }));
    const incomeData = allIncomeCategoryNames.map((name) => ({
      name,
      amount: incomeRows
        .filter((item) => item.incomeCategory === name)
        .reduce(
          (sum, item) => sum + item.amount * exchangeRates[item.currency],
          0,
        ),
    }));
    const buckets = new Map<string, { expense: number; income: number }>();
    [...filtered]
      .sort(
        (a, b) =>
          toDate(a.occurredAt).getTime() - toDate(b.occurredAt).getTime(),
      )
      .forEach((item) => {
        const date = toDate(item.occurredAt);
        const key =
          dimension === "年"
            ? `${date.getMonth() + 1}月`
            : dimension === "月"
              ? `${date.getDate()}日`
              : `${String(date.getHours()).padStart(2, "0")}:00`;
        const current = buckets.get(key) ?? { expense: 0, income: 0 };
        current[item.type === "支出" ? "expense" : "income"] +=
          item.amount * exchangeRates[item.currency];
        buckets.set(key, current);
      });
    const trend = [...buckets.entries()].map(([label, amounts]) => ({
      label,
      ...amounts,
    }));
    const impulse = moodData.find((item) => item.name === "冲动")?.amount ?? 0;
    const topCategory = [...categoryData].sort(
      (a, b) => b.amount - a.amount,
    )[0];
    const needExpense =
      moodData.find((item) => item.name === "刚需")?.amount ?? 0;
    const investmentIncome =
      incomeData.find((item) => item.name === "理财收益")?.amount ?? 0;
    const balance = incomeTotal - expenseTotal;
    const savingRate = incomeTotal ? (balance / incomeTotal) * 100 : 0;
    return {
      filtered,
      expenseTotal,
      incomeTotal,
      categoryData,
      moodData,
      incomeData,
      trend,
      impulse,
      topCategory,
      needExpense,
      investmentIncome,
      balance,
      savingRate,
    };
  }, [
    transactions,
    dimension,
    todayKey,
    exchangeRates,
    allCategoryNames,
    allIncomeCategoryNames,
  ]);

  const periodReports = useMemo(() => {
    if (!todayKey) return null;
    const today = new Date(`${todayKey}T12:00:00`);
    const summarize = (
      scope: "day" | "month" | "year",
      anchor: Date,
    ): PeriodSummary => {
      const rows = transactions.filter((item) => {
        const date = toDate(item.occurredAt);
        if (date.getFullYear() !== anchor.getFullYear()) return false;
        if (scope === "year") return true;
        if (date.getMonth() !== anchor.getMonth()) return false;
        return scope === "month" || date.getDate() === anchor.getDate();
      });
      const income = rows
        .filter((item) => item.type === "收入")
        .reduce(
          (sum, item) => sum + item.amount * exchangeRates[item.currency],
          0,
        );
      const expenseRows = rows.filter((item) => item.type === "支出");
      const expense = expenseRows.reduce(
        (sum, item) => sum + item.amount * exchangeRates[item.currency],
        0,
      );
      const categoryTotals = new Map<string, number>();
      expenseRows.forEach((item) => {
        const name = item.category ?? "未分类";
        categoryTotals.set(
          name,
          (categoryTotals.get(name) ?? 0) +
            item.amount * exchangeRates[item.currency],
        );
      });
      const top = [...categoryTotals.entries()].sort(
        (a, b) => b[1] - a[1],
      )[0];
      return {
        income,
        expense,
        balance: income - expense,
        count: rows.length,
        topCategory: top?.[0] ?? null,
        topCategoryAmount: top?.[1] ?? 0,
      };
    };
    const nightAnchor = new Date(today);
    if (new Date().getHours() < 5) nightAnchor.setDate(nightAnchor.getDate() - 1);
    const tomorrow = new Date(nightAnchor);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      daily: summarize("day", today),
      nightDaily: summarize("day", nightAnchor),
      nightMonthly: summarize("month", nightAnchor),
      nightYearly: summarize("year", nightAnchor),
      nightDateKey: `${nightAnchor.getFullYear()}-${String(nightAnchor.getMonth() + 1).padStart(2, "0")}-${String(nightAnchor.getDate()).padStart(2, "0")}`,
      isMonthEnd: tomorrow.getMonth() !== nightAnchor.getMonth(),
      isYearEnd: tomorrow.getFullYear() !== nightAnchor.getFullYear(),
    };
  }, [todayKey, transactions, exchangeRates]);

  const comfortMessage = useMemo(() => {
    const emptyMessage = {
      eyebrow: "TONIGHT'S NOTE",
      title: "今晚，辛苦了",
      body: "",
    };
    if (!clockTick || !periodReports || locked || tab !== "dashboard") {
      return emptyMessage;
    }
    const hour = new Date(clockTick).getHours();
    if (hour < 18 && hour >= 5) {
      return emptyMessage;
    }
    const scope = periodReports.isYearEnd
      ? "year"
      : periodReports.isMonthEnd
        ? "month"
        : "day";
    const summary =
      scope === "year"
        ? periodReports.nightYearly
        : scope === "month"
          ? periodReports.nightMonthly
          : periodReports.nightDaily;
    const periodName = scope === "year" ? "这一年" : scope === "month" ? "这个月" : "今天";
    const title =
      scope === "year"
        ? "这一年，真的辛苦了"
        : scope === "month"
          ? "这个月，你已经很努力了"
          : "今晚，先抱抱认真生活的自己";
    let body: string;
    if (!summary.count) {
      body = `${periodName}没有需要复盘的收支。空白不是落后，也可以是生活给你留的一小段安静。今晚先好好休息，明天再慢慢来。`;
    } else if (summary.balance >= 0) {
      body = `${periodName}收入 ${money.format(summary.income / 100)}，支出 ${money.format(summary.expense / 100)}，还稳稳留下了 ${money.format(summary.balance / 100)}。每一笔克制和努力都算数，你已经把生活照顾得很好了。`;
    } else {
      body = `${periodName}收入 ${money.format(summary.income / 100)}，支出 ${money.format(summary.expense / 100)}，暂时多支出了 ${money.format(Math.abs(summary.balance) / 100)}。先别责怪自己，账本记录的是生活的成本，不是你的价值。看见数字，就已经是重新掌握节奏的第一步。`;
    }
    if (summary.topCategory) {
      body += ` ${summary.topCategory}是这段时间最大的支出项（${money.format(summary.topCategoryAmount / 100)}），知道钱去了哪里，下一步就会更从容。`;
    }
    return {
      eyebrow:
        scope === "year"
          ? "YEAR-END LETTER"
          : scope === "month"
            ? "MONTH-END LETTER"
            : "TONIGHT'S NOTE",
      title,
      body,
    };
  }, [periodReports, locked, tab, clockTick]);

  const availableBillYears = useMemo(
    () =>
      [...new Set(transactions.map((item) => toDate(item.occurredAt).getFullYear()))]
        .sort((a, b) => b - a),
    [transactions],
  );
  const billResults = useMemo(() => {
    const anchor = todayKey ? new Date(`${todayKey}T12:00:00`) : null;
    const accountNames = new Map(
      accountList.map((account) => [account.id, account.name]),
    );
    const keyword = billQuery.trim().toLocaleLowerCase("zh-CN");
    const fallbackYear =
      availableBillYears.find((year) => year !== anchor?.getFullYear()) ??
      availableBillYears[0] ??
      anchor?.getFullYear() ??
      new Date().getFullYear();
    const selectedYear = Number(billYear || fallbackYear);
    let weekStart: Date | null = null,
      weekEnd: Date | null = null;
    if (anchor && billRange === "week") {
      weekStart = new Date(anchor);
      weekStart.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
      weekStart.setHours(0, 0, 0, 0);
      weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
    }
    const rows = transactions.filter((item) => {
      const date = toDate(item.occurredAt);
      const dateKey = toLocalDateKey(date);
      let inRange = true;
      if (anchor && billRange === "day") inRange = dateKey === todayKey;
      else if (anchor && billRange === "week")
        inRange = Boolean(weekStart && weekEnd && date >= weekStart && date < weekEnd);
      else if (anchor && billRange === "month")
        inRange =
          date.getFullYear() === anchor.getFullYear() &&
          date.getMonth() === anchor.getMonth();
      else if (anchor && billRange === "year")
        inRange = date.getFullYear() === anchor.getFullYear();
      else if (billRange === "other-year")
        inRange = date.getFullYear() === selectedYear;
      else if (billRange === "custom")
        inRange =
          (!billStartDate || dateKey >= billStartDate) &&
          (!billEndDate || dateKey <= billEndDate);
      if (!inRange || !keyword) return inRange;
      const searchable = [
        item.title,
        item.type,
        item.category,
        item.incomeCategory,
        item.mood,
        item.currency,
        accountNames.get(item.accountId),
        (item.amount / 100).toFixed(2),
        dateKey,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("zh-CN");
      return searchable.includes(keyword);
    });
    const income = rows
      .filter((item) => item.type === "收入")
      .reduce(
        (sum, item) => sum + item.amount * exchangeRates[item.currency],
        0,
      );
    const expense = rows
      .filter((item) => item.type === "支出")
      .reduce(
        (sum, item) => sum + item.amount * exchangeRates[item.currency],
        0,
      );
    return { rows, income, expense, balance: income - expense };
  }, [
    transactions,
    accountList,
    todayKey,
    billQuery,
    billRange,
    billYear,
    billStartDate,
    billEndDate,
    availableBillYears,
    exchangeRates,
  ]);

  const settlements = useMemo(
    () =>
      memberList
        .filter((member) => !member.isMe)
        .map((member) => {
          let balance = 0;
          for (const item of transactions) {
            if (item.splitWithMemberId !== member.id) continue;
            const cny = item.amount * exchangeRates[item.currency];
            if (item.splitMode === "全额由我支付") balance += cny;
            else if (item.splitMode === "全额由对方支付") balance -= cny;
            else if (item.splitMode === "按比例平摊")
              balance += Math.round((cny * (100 - item.mySharePercent)) / 100);
            else if (item.splitMode === "人情平账")
              balance += item.mySharePercent === 0 ? -cny : cny;
          }
          return { member, balance };
        })
        .filter((item) => item.balance !== 0),
    [memberList, transactions, exchangeRates],
  );

  useEffect(() => {
    if (!chartReady || tab !== "analytics" || !window.Chart) return;
    const Chart = window.Chart;
    const charts: ChartInstance[] = [];
    const chartText = theme === "obsidian" ? "#eaffdf" : "#655e55";
    const tooltip = {
      backgroundColor: "rgba(49,47,43,.94)",
      padding: 12,
      cornerRadius: 10,
      displayColors: true,
      titleFont: { size: 11 },
      bodyFont: { size: 11 },
    };
    const common = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: true },
      plugins: {
        legend: {
          position: "bottom" as const,
          labels: {
            color: chartText,
            usePointStyle: true,
            padding: 16,
            font: { family: "sans-serif", size: 10 },
          },
        },
        tooltip,
      },
    };
    if (pieCanvas.current)
      charts.push(
        new Chart(pieCanvas.current.getContext("2d")!, {
          type: "doughnut",
          data: {
            labels: analysis.categoryData.map(
              (item) => `${categoryMeta[item.name].emoji} ${item.name}`,
            ),
            datasets: [
              {
                label: "支出分类",
                data: analysis.categoryData.map((item) => item.amount / 100),
                backgroundColor: analysis.categoryData.map(
                  (item) => categoryMeta[item.name].color,
                ),
                borderWidth: 3,
                borderColor: "#fffdf8",
                hoverOffset: 10,
                weight: 1.25,
              },
              {
                label: "消费情绪",
                data: analysis.moodData.map((item) => item.amount / 100),
                backgroundColor: analysis.moodData.map(
                  (item) => moodMeta[item.name].color,
                ),
                borderWidth: 3,
                borderColor: "#fffdf8",
                hoverOffset: 8,
                weight: 0.8,
              },
            ],
          },
          options: {
            ...common,
            cutout: "42%",
            animation: { duration: 850, easing: "easeOutQuart" },
          },
        }),
      );
    if (moodCanvas.current)
      charts.push(
        new Chart(moodCanvas.current.getContext("2d")!, {
          type: "doughnut",
          data: {
            labels: analysis.incomeData.map(
              (item) => `${incomeMeta[item.name].emoji} ${item.name}`,
            ),
            datasets: [
              {
                label: "收入来源",
                data: analysis.incomeData.map((item) => item.amount / 100),
                backgroundColor: analysis.incomeData.map(
                  (item) => incomeMeta[item.name].color,
                ),
                borderWidth: 3,
                borderColor: "#fffdf8",
                hoverOffset: 12,
              },
            ],
          },
          options: {
            ...common,
            cutout: "65%",
            animation: { duration: 850, easing: "easeOutQuart" },
          },
        }),
      );
    if (lineCanvas.current) {
      const context = lineCanvas.current.getContext("2d")!;
      const orange = context.createLinearGradient(0, 0, 0, 240);
      orange.addColorStop(0, "rgba(225,124,91,.42)");
      orange.addColorStop(1, "rgba(225,124,91,0)");
      const green = context.createLinearGradient(0, 0, 0, 240);
      green.addColorStop(0, "rgba(77,157,116,.38)");
      green.addColorStop(1, "rgba(77,157,116,0)");
      charts.push(
        new Chart(context, {
          type: "line",
          data: {
            labels: analysis.trend.map((item) => item.label),
            datasets: [
              {
                label: "总支出",
                data: analysis.trend.map((item) => item.expense / 100),
                borderColor: "#e17c5b",
                backgroundColor: orange,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 7,
                pointBackgroundColor: "#e17c5b",
                borderWidth: 2.5,
              },
              {
                label: "总收入",
                data: analysis.trend.map((item) => item.income / 100),
                borderColor: "#4d9d74",
                backgroundColor: green,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 7,
                pointBackgroundColor: "#4d9d74",
                borderWidth: 2.5,
              },
            ],
          },
          options: {
            ...common,
            interaction: { mode: "index", intersect: false },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: "rgba(70,55,40,.06)" },
                border: { display: false },
              },
              x: { grid: { display: false }, border: { display: false } },
            },
          },
        }),
      );
    }
    if (forecastCanvas.current && forecast) {
      const context = forecastCanvas.current.getContext("2d")!;
      const gradient = context.createLinearGradient(0, 0, 0, 260);
      gradient.addColorStop(0, "rgba(112,170,137,.42)");
      gradient.addColorStop(1, "rgba(112,170,137,0)");
      charts.push(
        new Chart(context, {
          type: "line",
          data: {
            labels: forecast.points.map((item) => item.label),
            datasets: [
              {
                label: "预测净资产",
                data: forecast.points.map((item) => item.balance / 100),
                borderColor: forecast.points.map((item) =>
                  item.danger ? "#ef5e56" : "#65a77f",
                ),
                backgroundColor: gradient,
                pointBackgroundColor: forecast.points.map((item) =>
                  item.danger ? "#ef5e56" : "#65a77f",
                ),
                pointRadius: forecast.points.map((item) =>
                  item.danger ? 6 : 3,
                ),
                fill: true,
                tension: 0.4,
                borderWidth: 3,
              },
              {
                label: "真实购买力资产",
                data: forecast.points.map(
                  (item, index) =>
                    item.balance /
                    Math.pow(
                      1 + inflationConfig.inflationBps / 10000,
                      index / 12,
                    ) /
                    100,
                ),
                borderColor: "#8f83aa",
                backgroundColor: "transparent",
                borderDash: [6, 5],
                pointRadius: 2,
                fill: false,
                tension: 0.4,
                borderWidth: 2,
              },
            ],
          },
          options: {
            ...common,
            interaction: { mode: "index", intersect: false },
            scales: {
              y: {
                grid: { color: "rgba(100,90,70,.08)" },
                ticks: { color: chartText },
              },
              x: {
                grid: { display: false },
                ticks: { color: chartText, maxRotation: 0 },
              },
            },
          },
        }),
      );
    }
    return () => charts.forEach((chart) => chart.destroy());
  }, [
    analysis,
    chartReady,
    tab,
    theme,
    forecast,
    inflationConfig.inflationBps,
    categories,
    categoryMeta,
    incomeMeta,
  ]);

  const monthExpense = transactions
    .filter((item) => {
      if (item.type !== "支出") return false;
      if (!todayKey) return true;
      const date = toDate(item.occurredAt);
      const anchor = new Date(`${todayKey}T12:00:00`);
      return (
        date.getFullYear() === anchor.getFullYear() &&
        date.getMonth() === anchor.getMonth()
      );
    })
    .reduce((sum, item) => sum + item.amount * exchangeRates[item.currency], 0);
  const savingsAssetTotal = goalList.reduce(
    (sum, item) => sum + item.savedAmount,
    0,
  );
  const financialAssetTotal =
    accountList
      .filter((item) => item.type === "资产")
      .reduce(
        (sum, item) => sum + item.currentBalance * exchangeRates[item.currency],
        0,
      ) + savingsAssetTotal;
  const digitalAssetTotal = digitalAssetList.reduce(
    (sum, item) => sum + item.currentValue,
    0,
  );
  const assetTotal = financialAssetTotal + digitalAssetTotal;
  const liabilityTotal = accountList
    .filter((item) => item.type === "负债")
    .reduce(
      (sum, item) =>
        sum + Math.abs(item.currentBalance) * exchangeRates[item.currency],
      0,
    );
  const allocation = (["现金流", "固收防守", "风险进攻"] as const).map(
    (name) => ({
      name,
      amount: accountList
        .filter((item) => item.type === "资产" && item.assetClass === name)
        .reduce(
          (sum, item) =>
            sum +
            Math.max(0, item.currentBalance) * exchangeRates[item.currency],
          0,
        ),
    }),
  );
  const allocationTotal = Math.max(
      1,
      allocation.reduce((sum, item) => sum + item.amount, 0),
    ),
    cashRatio =
      (allocation.find((item) => item.name === "现金流")!.amount /
        allocationTotal) *
      100,
    debtRatio = (liabilityTotal / Math.max(1, assetTotal)) * 100;
  const netWorthCny = assetTotal - liabilityTotal,
    fireTarget = fireConfig.monthlyExpense * 300,
    fireProgress = Math.max(
      0,
      Math.min(100, (netWorthCny / Math.max(1, fireTarget)) * 100),
    );
  const inflationRate = inflationConfig.inflationBps / 10000,
    realNetWorthOneYear = netWorthCny / Math.pow(1 + inflationRate, 1);
  const currentMonthRows = transactions.filter((item) => {
    if (!todayKey) return false;
    const date = toDate(item.occurredAt),
      anchor = new Date(`${todayKey}T12:00:00`);
    return (
      date.getFullYear() === anchor.getFullYear() &&
      date.getMonth() === anchor.getMonth()
    );
  });
  const monthIncomeCny = currentMonthRows
      .filter((item) => item.type === "收入")
      .reduce(
        (sum, item) => sum + item.amount * exchangeRates[item.currency],
        0,
      ),
    monthExpenseCny = currentMonthRows
      .filter((item) => item.type === "支出")
      .reduce(
        (sum, item) => sum + item.amount * exchangeRates[item.currency],
        0,
      );
  const savingRateCny = monthIncomeCny
    ? ((monthIncomeCny - monthExpenseCny) / monthIncomeCny) * 100
    : 0;
  const initialNet = accountList.reduce(
      (sum, item) =>
        sum +
        (item.type === "资产"
          ? item.initialBalance
          : -Math.abs(item.initialBalance)) *
          exchangeRates[item.currency],
      0,
    ),
    growthRate = initialNet
      ? ((assetTotal - liabilityTotal - initialNet) / Math.abs(initialNet)) *
        100
      : 0;
  const rank =
    savingRateCny >= 45 && growthRate >= 10
      ? "赛博财神爷"
      : savingRateCny >= 25
        ? "疯狂星期四黄金常客"
        : savingRateCny >= 10
          ? "奶茶自由白银选手"
          : "不名一文的青铜打工人";
  const focusedBadge = badgeFocusCode
    ? (badgeDefinitions.find((badge) => badge.code === badgeFocusCode) ?? null)
    : null;
  const investmentAssets = accountList
    .filter((item) => item.isInvestment)
    .reduce(
      (sum, item) =>
        sum + Math.max(0, item.currentBalance) * exchangeRates[item.currency],
      0,
    );
  const emergencyLoss = stressEvents.emergency ? 3000000 : 0,
    marketLoss = stressEvents.crash ? investmentAssets * 0.5 : 0,
    stressedNet = Math.max(
      0,
      assetTotal - liabilityTotal - emergencyLoss - marketLoss,
    );
  const dailyBurn = Math.max(
      1,
      (forecast?.averageDailySpend ?? 0) +
        (forecast?.monthlyFixed ?? 0) / 30.4375,
    ),
    stressRunway = Math.max(0, Math.floor(stressedNet / dailyBurn));
  const liquidAssets =
    accountList
      .filter((item) => item.type === "资产" && !item.isInvestment)
      .reduce(
        (sum, item) =>
          sum + Math.max(0, item.currentBalance) * exchangeRates[item.currency],
        0,
      ) - emergencyLoss;
  const resilienceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(stressRunway / 3.65) -
        (stressEvents.crash ? 8 : 0) -
        (liquidAssets < 0 ? 18 : 0),
    ),
  );
  const sideIncomeCny = currentMonthRows
    .filter((item) => item.type === "收入" && item.isSideHustle)
    .reduce((sum, item) => sum + item.amount * exchangeRates[item.currency], 0);
  const sideCostCny = deductions.reduce((sum, row) => {
      const tx = transactions.find((item) => item.id === row.transactionId);
      return sum + row.amount * (tx ? exchangeRates[tx.currency] : 1);
    }, 0),
    sideProfit = Math.max(0, sideIncomeCny - sideCostCny);
  const laborTax = (grossCents: number) => {
    const gross = grossCents / 100;
    if (gross <= 800) return 0;
    const taxable = gross <= 4000 ? gross - 800 : gross * 0.8;
    const tax =
      taxable <= 20000
        ? taxable * 0.2
        : taxable <= 50000
          ? taxable * 0.3 - 2000
          : taxable * 0.4 - 7000;
    return Math.max(0, Math.round(tax * 100));
  };
  const estimatedTax = laborTax(sideIncomeCny);
  const warnings = accountList
    .filter((item) => item.type === "负债" && item.repaymentDay)
    .map((account) => {
      if (!todayKey) return { account, days: 99 };
      const now = new Date(`${todayKey}T12:00:00`);
      const due = new Date(
        now.getFullYear(),
        now.getMonth(),
        account.repaymentDay!,
      );
      if (due < now) due.setMonth(due.getMonth() + 1);
      return {
        account,
        days: Math.ceil((due.getTime() - now.getTime()) / 86400000),
      };
    })
    .filter((item) => item.days < 5);

  function openDialog(
    ref: React.RefObject<HTMLDialogElement | null>,
    setter: (value: boolean) => void,
  ) {
    setter(true);
    requestAnimationFrame(() => ref.current?.showModal());
  }
  function closeDialog(
    ref: React.RefObject<HTMLDialogElement | null>,
    setter: (value: boolean) => void,
  ) {
    ref.current?.close();
    setter(false);
  }
  function requestDeleteTransaction(id: number) {
    startTransition(async () => {
      const result = await deleteTransaction(id);
      const next = result.ok
        ? {
            kind: "success" as const,
            message: "账单已删除，关联账户余额也已恢复。",
          }
        : {
            kind: "warning" as const,
            message: result.error ?? "这笔账单暂时不能删除。",
          };
      setToast(next);
      window.setTimeout(() => setToast(null), 5200);
    });
  }
  function askNeoAi() {
    const question = chatInput.trim();
    if (!question) return;
    setChatInput("");
    setChatMessages((rows) => [...rows, { role: "user", content: question }]);
    startTransition(async () => {
      const response = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ledgerId: currentLedgerId, message: question }),
      });
      const result = (await response.json()) as {
        answer?: string;
        error?: string;
      };
      setChatMessages((rows) => [
        ...rows,
        {
          role: "assistant",
          content: result.answer ?? result.error ?? "财富智囊暂时掉线了。",
        },
      ]);
    });
  }
  async function sendPeerSignal(
    kind: string,
    payload: unknown,
    to = p2pTarget,
  ) {
    if (!p2pRoom || !p2pNode || !to) return;
    await fetch("/api/p2p/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room: p2pRoom,
        fromNode: p2pNode,
        toNode: to,
        kind,
        payload,
      }),
    });
  }
  function setupPeerChannel(channel: RTCDataChannel) {
    channelRef.current = channel;
    channel.onopen = async () => {
      setP2pStatus("P2P 通道已连接，正在交换增量");
      const snapshot = await fetch(
        `/api/p2p/crdt?ledger=${currentLedgerId}`,
      ).then((r) => r.json());
      channel.send(JSON.stringify({ type: "sync", snapshot }));
    };
    channel.onmessage = async (event) => {
      const message = JSON.parse(String(event.data)) as {
        type: string;
        snapshot?: Record<string, unknown>;
      };
      if (!message.snapshot) return;
      const response = await fetch("/api/p2p/crdt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ledgerId: currentLedgerId,
          ...message.snapshot,
        }),
      });
      const result = (await response.json()) as {
        inserted?: number;
        deleted?: number;
      };
      setP2pStatus(
        `同步完成：新增 ${result.inserted ?? 0}，删除 ${result.deleted ?? 0}`,
      );
      if (message.type === "sync") {
        const snapshot = await fetch(
          `/api/p2p/crdt?ledger=${currentLedgerId}`,
        ).then((r) => r.json());
        channel.send(JSON.stringify({ type: "reply", snapshot }));
      }
      window.setTimeout(() => window.location.reload(), 700);
    };
    channel.onclose = () => setP2pStatus("节点已断开");
  }
  function makePeer() {
    const peer = new RTCPeerConnection({ iceServers: [] });
    peerRef.current = peer;
    peer.onicecandidate = (event) => {
      if (event.candidate) void sendPeerSignal("ice", event.candidate.toJSON());
    };
    peer.ondatachannel = (event) => setupPeerChannel(event.channel);
    peer.onconnectionstatechange = () =>
      setP2pStatus(`连接状态：${peer.connectionState}`);
    return peer;
  }
  async function hostPeer() {
    if (!p2pTarget) {
      alert("请填写对端节点 ID");
      return;
    }
    peerRef.current?.close();
    const peer = makePeer(),
      channel = peer.createDataChannel("neo-ledger-crdt", { ordered: true });
    setupPeerChannel(channel);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await sendPeerSignal("offer", offer);
    setP2pStatus("握手邀请已发送，等待对端回应");
  }
  async function handlePeerSignal(signal: {
    id: number;
    fromNode: string;
    kind: string;
    payload: string;
  }) {
    signalCursorRef.current = Math.max(signalCursorRef.current, signal.id);
    const payload = JSON.parse(signal.payload);
    if (signal.kind === "offer") {
      setP2pTarget(signal.fromNode);
      peerRef.current?.close();
      const peer = makePeer();
      await peer.setRemoteDescription(payload);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendPeerSignal("answer", answer, signal.fromNode);
      setP2pStatus("已接受局域网节点握手");
    } else if (signal.kind === "answer" && peerRef.current)
      await peerRef.current.setRemoteDescription(payload);
    else if (signal.kind === "ice" && peerRef.current)
      try {
        await peerRef.current.addIceCandidate(payload);
      } catch {}
  }
  function saveInflation(formData: FormData) {
    startTransition(async () => {
      const inflationRate = Number(formData.get("inflationRate"));
      const response = await fetch("/api/economic-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ledgerId: currentLedgerId, inflationRate }),
      });
      if (response.ok)
        setInflationConfig({
          ledgerId: currentLedgerId,
          inflationBps: Math.round(inflationRate * 100),
          updatedAt: new Date().toISOString(),
        });
    });
  }
  function saveFire(formData: FormData) {
    startTransition(async () => {
      const monthlyExpense = Number(formData.get("monthlyExpense")),
        annualReturn = Number(formData.get("annualReturn"));
      const response = await fetch("/api/fire-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ledgerId: currentLedgerId,
          monthlyExpense,
          annualReturn,
        }),
      });
      if (response.ok)
        setFireConfig({
          ledgerId: currentLedgerId,
          monthlyExpense: Math.round(monthlyExpense * 100),
          annualReturnBps: Math.round(annualReturn * 100),
          updatedAt: new Date().toISOString(),
        });
    });
  }
  async function checkAppUpdate() {
    setUpdateChecking(true);
    setUpdateError("");
    try {
      const response = await fetch("/api/app-update", { cache: "no-store" });
      const result = (await response.json()) as AppUpdateInfo & { error?: string };
      if (!response.ok) throw new Error(result.error || "检查更新失败");
      setUpdateInfo(result);
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "检查更新失败");
    } finally {
      setUpdateChecking(false);
    }
  }
  async function waitForAppUpdate(expectedVersion: string) {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch("/api/app-update/health", {
          cache: "no-store",
        });
        if (response.ok) {
          const result = (await response.json()) as { version?: string };
          if (result.version === expectedVersion) {
            setToast({
              kind: "success",
              message: `已升级到 v${expectedVersion}，账本数据保持不变。`,
            });
            window.setTimeout(() => window.location.reload(), 800);
            return;
          }
        }
      } catch {}
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    setUpdateApplying(false);
    setUpdateError("程序重启超时；原版本会自动回滚，请查看终端状态");
  }
  function applyAppUpdate() {
    if (!updateInfo?.available || !updateInfo.tag) return;
    if (
      !window.confirm(
        `升级到 v${updateInfo.latestVersion}？程序会先备份账本数据库，升级期间将自动重启。`,
      )
    )
      return;
    setUpdateApplying(true);
    setUpdateError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/app-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag: updateInfo.tag }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error || "启动更新失败");
        void waitForAppUpdate(updateInfo.latestVersion);
      } catch (error) {
        setUpdateApplying(false);
        setUpdateError(error instanceof Error ? error.message : "启动更新失败");
      }
    });
  }
  function syncWebDav(formData: FormData) {
    const mode = String(formData.get("mode")),
      url = String(formData.get("url") || ""),
      username = String(formData.get("username") || ""),
      password = String(formData.get("password") || ""),
      secret = String(formData.get("secret") || "");
    if (!url || !secret || secret.length < 8) {
      alert("请填写 WebDAV 地址和至少 8 位本地同步密钥");
      return;
    }
    localStorage.setItem(
      "neo-webdav-config",
      JSON.stringify({ url, username }),
    );
    setSyncing(true);
    startTransition(async () => {
      try {
        const credentials = { url, username, password };
        const local = (await fetch("/api/data/export?format=json", {
          cache: "no-store",
        }).then((r) => r.json())) as Record<string, unknown>;
        if (mode === "upload") {
          const payload = await encryptSyncPayload(local, secret);
          const response = await fetch("/api/webdav-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...credentials, action: "upload", payload }),
          });
          if (!response.ok)
            throw new Error(
              ((await response.json()) as { error?: string }).error,
            );
          setSyncStatus("刚刚完成加密上传");
        } else {
          const response = await fetch("/api/webdav-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...credentials, action: "download" }),
          });
          const result = (await response.json()) as {
            payload?: string;
            error?: string;
          };
          if (!response.ok || !result.payload)
            throw new Error(result.error || "云端没有备份");
          const remote = await decryptSyncPayload(result.payload, secret);
          let next = remote;
          if (mode === "merge") {
            next = mergeSyncSnapshots(local, remote);
            const encrypted = await encryptSyncPayload(next, secret);
            await fetch("/api/webdav-sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...credentials,
                action: "upload",
                payload: encrypted,
              }),
            });
          }
          const restore = await fetch("/api/data/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next),
          });
          if (!restore.ok)
            throw new Error(
              ((await restore.json()) as { error?: string }).error,
            );
          setSyncStatus(
            mode === "merge" ? "刚刚完成双向冲突合并" : "刚刚从云端解密恢复",
          );
          window.location.reload();
        }
      } catch (error) {
        alert(error instanceof Error ? error.message : "同步失败");
      } finally {
        setSyncing(false);
      }
    });
  }
  function submitEntry(formData: FormData) {
    if (nudgeActive && reflection.trim() !== reflectionPhrase) {
      alert("阻尼模式已启动，请完整输入冷静期反思句后再提交。");
      return;
    }
    formData.set("ledgerId", String(currentLedgerId));
    formData.set("type", entryType);
    formData.set("accountId", String(accountId));
    formData.set(
      "originalTimezone",
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    );
    if (entryType === "支出") {
      formData.set("mood", mood);
      formData.set("category", category);
      if (splitMemberId) {
        formData.set("splitMode", splitMode);
        formData.set("splitWithMemberId", String(splitMemberId));
        formData.set(
          "mySharePercent",
          String(
            splitMode === "按比例平摊"
              ? mySharePercent
              : splitMode === "全额由我支付"
                ? 0
                : 100,
          ),
        );
      }
    } else {
      formData.set("incomeCategory", incomeCategory);
    }
    if (!navigator.onLine) {
      const entry = Object.fromEntries(formData.entries()) as Record<
        string,
        unknown
      >;
      entry.offlineId = crypto.randomUUID();
      entry.occurredAt = String(entry.occurredAt || new Date().toISOString());
      startTransition(async () => {
        await offlinePut(entry);
        const rows = await offlineList();
        setOfflineCount(rows.length);
        closeDialog(entryRef, setEntryOpen);
      });
      return;
    }
    startTransition(async () => {
      await addTransaction(formData);
      closeDialog(entryRef, setEntryOpen);
      setImportText("");
      setParsedAmount("");
      setParsedTitle("");
    });
  }
  function runParser() {
    startTransition(async () => {
      const result = await parseImportText(importText, currentLedgerId);
      setParsedPreview(result);
    });
  }
  function confirmParsed() {
    if (!parsedPreview) return;
    const formData = new FormData();
    formData.set("ledgerId", String(currentLedgerId));
    formData.set("amount", parsedPreview.amount);
    formData.set("title", parsedPreview.title);
    formData.set("type", parsedPreview.type);
    formData.set("accountId", String(parsedPreview.accountId));
    if (parsedPreview.type === "支出") {
      formData.set("category", parsedPreview.category);
      formData.set("mood", parsedPreview.mood);
    } else formData.set("incomeCategory", parsedPreview.incomeCategory);
    startTransition(async () => {
      await addTransaction(formData);
      setParsedPreview(null);
      setImportText("");
      closeDialog(entryRef, setEntryOpen);
    });
  }
  function showAccountDialog(account: Account | null) {
    setEditingAccount(account);
    setAccountType(account?.type ?? "资产");
    setAccountError("");
    openDialog(accountRef, setAccountOpen);
  }
  function submitAccount(formData: FormData) {
    startTransition(async () => {
      setAccountError("");
      const payload = {
        ledgerId: currentLedgerId,
        id: editingAccount?.id,
        name: String(formData.get("name") || ""),
        type: accountType,
        balance: Number(formData.get("balance")),
        billDay:
          accountType === "负债" ? Number(formData.get("billDay")) : null,
        repaymentDay:
          accountType === "负债" ? Number(formData.get("repaymentDay")) : null,
        isInvestment:
          accountType === "资产" && formData.get("isInvestment") === "on",
        currency: String(formData.get("currency") || "CNY") as Currency,
        assetClass: String(formData.get("assetClass") || "现金流"),
      };
      const response = await fetch(`/api/accounts?ledger=${currentLedgerId}`, {
        method: editingAccount ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setAccountError(result.error ?? "保存失败");
        return;
      }
      await reloadAccounts();
      closeDialog(accountRef, setAccountOpen);
    });
  }
  function submitTransfer(formData: FormData) {
    const fromAccountId = Number(formData.get("fromAccountId"));
    const toAccountId = Number(formData.get("toAccountId"));
    const target = accountList.find((item) => item.id === toAccountId);
    startTransition(async () => {
      const response = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ledgerId: currentLedgerId,
          kind: target?.type === "负债" ? "信用卡还款" : "账户转账",
          fromAccountId,
          toAccountId,
          amount: Number(formData.get("amount")),
          occurredAt: new Date().toISOString(),
          originalTimezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
          note: String(formData.get("note") || ""),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setAccountError(result.error ?? "转账失败");
        return;
      }
      await reloadAccounts();
      closeDialog(transferRef, setTransferOpen);
      setToast({ kind: "success", message: target?.type === "负债" ? "还款已同时更新资产与负债。" : "账户转账已完成。" });
    });
  }
  function removeAccount() {
    if (!editingAccount) return;
    startTransition(async () => {
      const response = await fetch(`/api/accounts?id=${editingAccount.id}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setAccountError(result.error ?? "注销失败");
        return;
      }
      await reloadAccounts();
      closeDialog(accountRef, setAccountOpen);
    });
  }
  function submitDigitalAsset(formData: FormData) {
    startTransition(async () => {
      setAssetError("");
      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ledgerId: currentLedgerId,
          name: String(formData.get("name") || ""),
          assetType,
          purchasePrice: Number(formData.get("purchasePrice")),
          purchaseDate: String(formData.get("purchaseDate") || ""),
          lifespanMonths: Number(formData.get("lifespanMonths")),
          residualRate: Number(formData.get("residualRate")),
          heatLevel:
            assetType === "游戏账号"
              ? String(formData.get("heatLevel") || "中")
              : null,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setAssetError(result.error ?? "添置失败");
        return;
      }
      await reloadDigitalAssets();
      closeDialog(assetRef, setAssetOpen);
      setToast({ kind: "success", message: "新装备已放入资产货架。" });
    });
  }
  function saveExpenseCategory(formData: FormData) {
    startTransition(async () => {
      setCategoryError("");
      const response = await fetch("/api/categories", {
        method: editingCategory ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingCategory?.id,
          ledgerId: currentLedgerId,
          name: String(formData.get("name") || ""),
          icon: String(formData.get("icon") || "📦"),
          color: String(formData.get("color") || "#8f91b8"),
          isActive: true,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setCategoryError(result.error ?? "保存失败");
        return;
      }
      await reloadCategories();
      setEditingCategory(null);
      setCategoryError("");
    });
  }
  function disableExpenseCategory(item: ExpenseCategory) {
    startTransition(async () => {
      setCategoryError("");
      const response = await fetch(
        `/api/categories?id=${item.id}&ledger=${currentLedgerId}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setCategoryError(result.error ?? "删除失败");
        return;
      }
      await reloadCategories();
      setEditingCategory(null);
    });
  }
  function restoreExpenseCategory(item: ExpenseCategory) {
    startTransition(async () => {
      const response = await fetch("/api/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          ledgerId: currentLedgerId,
          name: item.name,
          icon: item.icon,
          color: item.color,
          isActive: true,
        }),
      });
      if (response.ok) await reloadCategories();
    });
  }
  function saveIncomeCategory(formData: FormData) {
    startTransition(async () => {
      setIncomeCategoryError("");
      const response = await fetch("/api/income-categories", {
        method: editingIncomeCategory ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingIncomeCategory?.id,
          ledgerId: currentLedgerId,
          name: String(formData.get("name") || ""),
          icon: String(formData.get("icon") || "💰"),
          color: String(formData.get("color") || "#78a98c"),
          isActive: true,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setIncomeCategoryError(result.error ?? "保存失败");
        return;
      }
      await reloadIncomeCategories();
      setEditingIncomeCategory(null);
    });
  }
  function removeIncomeCategory(item: ExpenseCategory) {
    startTransition(async () => {
      setIncomeCategoryError("");
      const response = await fetch(
        `/api/income-categories?id=${item.id}&ledger=${currentLedgerId}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setIncomeCategoryError(result.error ?? "删除失败");
        return;
      }
      await reloadIncomeCategories();
      setEditingIncomeCategory(null);
    });
  }
  function restoreIncomeCategory(item: ExpenseCategory) {
    startTransition(async () => {
      const response = await fetch("/api/income-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          ledgerId: currentLedgerId,
          name: item.name,
          icon: item.icon,
          color: item.color,
          isActive: true,
        }),
      });
      if (response.ok) await reloadIncomeCategories();
    });
  }
  function showLiquidation(asset: DigitalAsset) {
    setLiquidatingAsset(asset);
    setAssetError("");
    openDialog(liquidationRef, () => {});
  }
  function submitLiquidation(formData: FormData) {
    if (!liquidatingAsset) return;
    startTransition(async () => {
      setAssetError("");
      const discard = formData.get("mode") === "discard";
      const response = await fetch("/api/assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: liquidatingAsset.id,
          ledgerId: currentLedgerId,
          salePrice: discard ? 0 : Number(formData.get("salePrice")),
          accountId: Number(formData.get("accountId")),
          paymentAccountId: Number(formData.get("paymentAccountId")),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setAssetError(result.error ?? "变现失败");
        return;
      }
      liquidationRef.current?.close();
      setLiquidatingAsset(null);
      window.location.reload();
    });
  }
  function processPending(
    id: number,
    category?: Category,
    action: "confirm" | "ignore" = "confirm",
  ) {
    startTransition(async () => {
      const response = await fetch("/api/pending-transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, category, action }),
      });
      if (response.ok) {
        await reloadPendingFlows();
        await reloadAccounts();
        if (action === "confirm") window.location.reload();
      }
    });
  }
  function saveCategoryBudget(formData: FormData) {
    startTransition(async () => {
      const category = String(formData.get("category")) as Category;
      const amount = Number(formData.get("amount"));
      const response = await fetch("/api/category-budgets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ledgerId: currentLedgerId, category, amount }),
      });
      if (response.ok)
        setCategoryBudgetList((rows) =>
          rows.map((row) =>
            row.category === category
              ? { ...row, amount: Math.round(amount * 100) }
              : row,
          ),
        );
    });
  }
  function submitSubscription(formData: FormData) {
    setSubscriptionError("");
    startTransition(async () => {
      const body = {
        id: editingSubscription?.id,
        ledgerId: currentLedgerId,
        name: formData.get("name"),
        amount: Number(formData.get("amount")),
        accountId: Number(formData.get("accountId")),
        cycle: formData.get("cycle"),
        category: subscriptionCategory,
        nextChargeDate: formData.get("nextChargeDate"),
      };
      const response = await fetch("/api/subscriptions", {
        method: editingSubscription ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (response.ok) {
        await reloadSubscriptions();
        closeDialog(subscriptionRef, setSubscriptionOpen);
        setEditingSubscription(null);
        setToast({
          kind: "success",
          message: editingSubscription
            ? "续费信息已经更新。"
            : "新的续费项目已经添加。",
        });
      } else {
        setSubscriptionError(result.error ?? "保存失败");
      }
    });
  }
  function removeSubscription(id: number) {
    startTransition(async () => {
      const response = await fetch(
        `/api/subscriptions?id=${id}&ledger=${currentLedgerId}`,
        { method: "DELETE" },
      );
      if (response.ok)
        setSubscriptionList((rows) => rows.filter((row) => row.id !== id));
    });
  }
  function addSubscriptionCategory() {
    const name = subscriptionCategoryDraft.name.trim().slice(0, 12);
    if (!name) {
      setSubscriptionCategoryError("请输入分类名称");
      return;
    }
    startTransition(async () => {
      setSubscriptionCategoryError("");
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ledgerId: currentLedgerId,
          name,
          icon: subscriptionCategoryDraft.icon,
          color: subscriptionCategoryDraft.color,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setSubscriptionCategoryError(result.error ?? "添加失败");
        return;
      }
      await reloadCategories();
      setSubscriptionCategory(name);
      setSubscriptionCategoryDraft({
        name: "",
        icon: "📦",
        color: "#8f91b8",
      });
    });
  }
  function removeSubscriptionCategory(item: ExpenseCategory) {
    if (!window.confirm(`删除分类「${item.name}」？历史记录会保留。`)) return;
    startTransition(async () => {
      setSubscriptionCategoryError("");
      const response = await fetch(
        `/api/categories?id=${item.id}&ledger=${currentLedgerId}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setSubscriptionCategoryError(result.error ?? "删除失败");
        return;
      }
      if (subscriptionCategory === item.name) {
        setSubscriptionCategory(
          categoryList.find(
            (candidate) => candidate.isActive && candidate.id !== item.id,
          )?.name ?? "",
        );
      }
      await reloadCategories();
    });
  }
  function submitInstallment(formData: FormData) {
    startTransition(async () => {
      const response = await fetch("/api/installments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ledgerId: currentLedgerId,
          name: formData.get("name"),
          totalAmount: Number(formData.get("totalAmount")),
          periods: Number(formData.get("periods")),
          feeAmount: Number(formData.get("feeAmount")),
          accountId: Number(formData.get("accountId")),
          startMonth: formData.get("startMonth"),
          chargeDay: Number(formData.get("chargeDay")),
        }),
      });
      if (response.ok) window.location.reload();
      else
        alert(
          ((await response.json()) as { error?: string }).error ?? "创建失败",
        );
    });
  }
  function restoreBackup(file: File | undefined) {
    if (!file || !window.confirm("恢复备份会覆盖当前全部数据，确定继续吗？"))
      return;
    startTransition(async () => {
      const response = await fetch("/api/data/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await file.text(),
      });
      if (response.ok) window.location.reload();
      else
        alert(
          ((await response.json()) as { error?: string }).error ?? "恢复失败",
        );
    });
  }
  function parseBillFiles(fileList: FileList | File[] | undefined) {
    const files = fileList ? Array.from(fileList) : [];
    if (!files.length) return;
    setBillImportError("");
    setBillImportStatus("正在读取账单文件…");
    setBillImportItems([]);
    setBillImportSummary(null);
    startTransition(async () => {
      try {
        const parsedBatch = await parseStatementFiles(files, setBillImportStatus);
        if (!parsedBatch.statements.length) {
          setBillImportError(
            parsedBatch.failures.map((item) => `${item.fileName}：${item.error}`).join("；") ||
              "没有识别到有效流水",
          );
          return;
        }
        const parsedItems = parsedBatch.statements.flatMap(
          ({ statement }) => statement.items,
        );
        const response = await fetch("/api/bill-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ledgerId: currentLedgerId,
            items: parsedItems,
          }),
        });
        const result = (await response.json()) as {
          items?: ImportedBill[];
          detected?: number;
          duplicates?: number;
          possibleDuplicates?: number;
          unmapped?: number;
          unconfirmed?: number;
          truncated?: number;
          error?: string;
        };
        if (!response.ok) {
          setBillImportError(result.error ?? "解析失败");
          return;
        }
        const items = result.items ?? [];
        const sourceNames = [
          ...new Set(parsedBatch.statements.map(({ statement }) => statement.sourceName)),
        ];
        setBillImportItems(items);
        const fileReconciliations = parsedBatch.statements.map(
          ({ fileName, statement }) => ({
            fileName,
            totalRows: statement.totalRows,
            success: statement.items.length,
            filtered: statement.filtered ?? statement.skipped,
            unconfirmed:
              statement.unconfirmed ??
              Math.max(0, statement.totalRows - statement.items.length - statement.skipped),
            truncated: statement.truncated ?? 0,
          }),
        );
        setBillImportSummary({
          fileName: files.length === 1 ? files[0].name : `${files.length} 个文件`,
          sourceName: sourceNames.length === 1 ? sourceNames[0] : `${sourceNames.length} 类账单`,
          detected: result.detected ?? parsedItems.length,
          ready: items.length,
          skipped: parsedBatch.statements.reduce(
            (sum, { statement }) => sum + statement.skipped,
            0,
          ),
          duplicates: result.duplicates ?? 0,
          possibleDuplicates: result.possibleDuplicates ?? 0,
          unmapped: result.unmapped ?? 0,
          totalRows: fileReconciliations.reduce((sum, row) => sum + row.totalRows, 0),
          filtered:
            fileReconciliations.reduce((sum, row) => sum + row.filtered, 0) +
            (result.duplicates ?? 0),
          unconfirmed:
            fileReconciliations.reduce((sum, row) => sum + row.unconfirmed, 0) +
            (result.unconfirmed ?? 0),
          truncated:
            fileReconciliations.reduce((sum, row) => sum + row.truncated, 0) +
            (result.truncated ?? 0),
          files: fileReconciliations,
        });
        setBillImportError(
          parsedBatch.failures.length
            ? `${parsedBatch.failures.length} 个文件未加入：${parsedBatch.failures
                .map((item) => `${item.fileName}（${item.error}）`)
                .join("；")}`
            : "",
        );
      } catch (error) {
        setBillImportError(
          error instanceof Error ? error.message : "无法读取这个账单文件",
        );
      } finally {
        setBillImportStatus("");
      }
    });
  }
  function assignBillAccount(paymentMethod: string, nextAccountId: number) {
    const account = accountList.find((item) => item.id === nextAccountId);
    const nextRows = billImportItems.map((row) =>
        row.paymentMethod === paymentMethod
          ? {
              ...row,
              accountId: account?.id ?? 0,
              accountName: account?.name ?? "请选择账户",
            }
          : row,
    );
    setBillImportItems(nextRows);
    setBillImportSummary((current) =>
      current
        ? {
            ...current,
            unmapped: nextRows.filter((row) => row.accountId <= 0).length,
          }
        : current,
    );
  }
  function confirmBillImport() {
    const unmapped = billImportItems.filter((item) => item.accountId <= 0);
    if (unmapped.length) {
      setBillImportError(`还有 ${unmapped.length} 笔流水没有选择入账账户`);
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/bill-import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ledgerId: currentLedgerId,
          items: billImportItems,
        }),
      });
      const result = (await response.json()) as {
        imported?: number;
        duplicates?: number;
        skipped?: number;
        error?: string;
      };
      if (response.ok) {
        setToast({
          kind: "success",
          message: `已导入 ${result.imported ?? 0} 笔流水${result.duplicates ? `，跳过 ${result.duplicates} 笔重复项` : ""}。`,
        });
        window.setTimeout(() => window.location.reload(), 500);
      } else setBillImportError(result.error ?? "导入失败");
    });
  }
  function cleanBadBillImports() {
    if (
      !window.confirm(
        "将删除命中声明/法律条款黑名单的错误账单，并自动恢复受影响账户余额。确定继续吗？",
      )
    )
      return;
    startTransition(async () => {
      const response = await fetch(
        `/api/bill-import?ledger=${currentLedgerId}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as {
        deleted?: number;
        error?: string;
      };
      if (response.ok) {
        alert(`已清理 ${result.deleted ?? 0} 笔声明账单，并修复账户余额。`);
        window.location.reload();
      } else setBillImportError(result.error ?? "清理失败");
    });
  }
  function createLedger() {
    const choice = window.prompt(
      "新账本名称：旅游专项账本 / 差旅报销账本 / 追星二次元账本",
      "旅游专项账本",
    );
    if (!choice) return;
    const icon = choice.includes("旅游")
      ? "✈️"
      : choice.includes("差旅")
        ? "💼"
        : "🌟";
    startTransition(async () => {
      const response = await fetch("/api/ledgers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: choice, icon }),
      });
      if (response.ok) {
        const row = (await response.json()) as { id: number };
        window.location.href = `/?ledger=${row.id}`;
      }
    });
  }
  function deleteLedger() {
    const ledger = ledgers.find((item) => item.id === currentLedgerId);
    if (!ledger) return;
    if (ledgers.length <= 1) {
      alert("至少需要保留一个账本。");
      return;
    }
    if (
      !window.confirm(
        `确定删除“${ledger.name}”吗？\n\n其中的账单、账户、预算和分类等数据都会永久删除，此操作无法撤销。`,
      )
    )
      return;
    startTransition(async () => {
      const response = await fetch(`/api/ledgers?id=${currentLedgerId}`, {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (response.ok) {
        const next = ledgers.find((item) => item.id !== currentLedgerId);
        window.location.href = next ? `/?ledger=${next.id}` : "/";
      } else {
        alert(result.error ?? "删除账本失败，请稍后重试。");
      }
    });
  }
  function submitGoal(formData: FormData) {
    setGoalError("");
    startTransition(async () => {
      const response = await fetch("/api/savings-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ledgerId: currentLedgerId,
          name: formData.get("name"),
          targetAmount: Number(formData.get("targetAmount")),
          deadline: formData.get("deadline"),
          icon: formData.get("icon"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (response.ok) {
        await reloadGoals();
        closeDialog(goalRef, setGoalOpen);
        setToast({ kind: "success", message: "新心愿已经放进储蓄罐。" });
      } else {
        setGoalError(result.error ?? "创建失败");
      }
    });
  }
  function contributeGoal(formData: FormData) {
    if (!savingGoal) return;
    setGoalError("");
    startTransition(async () => {
      const response = await fetch("/api/savings-goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: savingGoal.id,
          accountId: Number(formData.get("accountId")),
          amount: Number(formData.get("amount")),
        }),
      });
      const result = (await response.json()) as {
        appliedAmount?: number;
        completed?: boolean;
        error?: string;
      };
      if (response.ok) {
        await Promise.all([reloadGoals(), reloadAccounts()]);
        closeDialog(goalRef, setGoalOpen);
        setSavingGoal(null);
        setToast({
          kind: "success",
          message: result.completed
            ? "目标金额已存满，心愿达成。"
            : `已存入 ${money.format((result.appliedAmount ?? 0) / 100)}。`,
        });
      } else {
        setGoalError(result.error ?? "存入失败");
      }
    });
  }
  function deleteGoal(formData: FormData) {
    if (!savingGoal) return;
    const hasSavings = savingGoal.savedAmount > 0;
    const message = hasSavings
      ? `删除「${savingGoal.name}」并将 ${money.format(savingGoal.savedAmount / 100)} 退回所选账户？`
      : `删除「${savingGoal.name}」？`;
    if (!window.confirm(message)) return;
    setGoalError("");
    startTransition(async () => {
      const response = await fetch("/api/savings-goals", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: savingGoal.id,
          accountId: Number(formData.get("accountId")),
        }),
      });
      const result = (await response.json()) as {
        refundedAmount?: number;
        error?: string;
      };
      if (response.ok) {
        await Promise.all([reloadGoals(), reloadAccounts()]);
        closeDialog(goalRef, setGoalOpen);
        setSavingGoal(null);
        setToast({
          kind: "success",
          message: (result.refundedAmount ?? 0) > 0
            ? `心愿已删除，${money.format((result.refundedAmount ?? 0) / 100)} 已退回账户。`
            : "心愿已删除。",
        });
      } else {
        setGoalError(result.error ?? "删除失败");
      }
    });
  }
  function chooseTheme(next: ThemeName) {
    setTheme(next);
    startTransition(async () => {
      await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
    });
  }
  function configureLock(formData: FormData) {
    const enabled = formData.get("enabled") === "on",
      nextPin = String(formData.get("pin") || "");
    startTransition(async () => {
      const response = await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, pin: nextPin }),
      });
      if (response.ok) {
        setSecurityEnabled(enabled);
        setLocked(enabled);
        closeDialog(aestheticRef, setAestheticOpen);
      } else
        alert(
          ((await response.json()) as { error?: string }).error ?? "设置失败",
        );
    });
  }
  function unlock() {
    startTransition(async () => {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (response.ok) {
        setLocked(false);
        setLockError("");
      } else {
        setLockError("安全码不正确，请再试一次");
        setPin("");
      }
    });
  }
  function scanReceipt(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    if (receiptUrl) URL.revokeObjectURL(receiptUrl);
    setReceiptUrl(URL.createObjectURL(file));
    setScanning(true);
    setParsedPreview(null);
    setTimeout(() => {
      startTransition(async () => {
        const result = await parseImportText(
          "今天在麦当劳吃汉堡花了35元，用支付宝付的，太冲动了",
          currentLedgerId,
        );
        setParsedPreview(result);
        setScanning(false);
      });
    }, 1700);
  }
  function addMember() {
    const name = window.prompt(
      "分账搭子的名字",
      memberList.length === 1 ? "对象" : "室友",
    );
    if (!name) return;
    startTransition(async () => {
      const response = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ledgerId: currentLedgerId,
          name,
          icon: name.includes("对象") ? "💞" : "🧑‍🤝‍🧑",
        }),
      });
      if (response.ok) {
        const row = (await response.json()) as Member;
        setMemberList((items) => [...items, row]);
        setSplitMemberId(row.id);
      }
    });
  }
  function settle(memberId: number, balance: number) {
    if (!window.confirm("确认生成一笔人情平账流水并清空当前债务？")) return;
    startTransition(async () => {
      const response = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ledgerId: currentLedgerId,
          memberId,
          amount: Math.abs(balance),
          direction: balance > 0 ? "owesMe" : "iOwe",
        }),
      });
      if (response.ok) window.location.reload();
    });
  }

  const categorySpend = Object.fromEntries(
    categories.map((name) => [
      name,
      transactions
        .filter(
          (item) =>
            item.type === "支出" &&
            item.category === name &&
            (!todayKey || item.occurredAt.startsWith(todayKey.slice(0, 7))),
        )
        .reduce(
          (sum, item) => sum + item.amount * exchangeRates[item.currency],
          0,
        ),
    ]),
  ) as Record<Category, number>;
  const impulseDays = new Set(
    transactions
      .filter((item) => item.type === "支出" && item.mood === "冲动")
      .map((item) => item.occurredAt.slice(0, 10)),
  );
  let threeDayImpulse = false;
  if (todayKey) {
    const anchor = new Date(`${todayKey}T12:00:00`);
    threeDayImpulse = [0, 1, 2].every((offset) => {
      const date = new Date(anchor);
      date.setDate(date.getDate() - offset);
      return impulseDays.has(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      );
    });
  }
  const activeCategoryLimit =
      categoryBudgetList.find((item) => item.category === category)?.amount ??
      0,
    budgetFriction =
      activeCategoryLimit > 0 &&
      categorySpend[category] / activeCategoryLimit >= 0.9,
    nudgeActive = entryType === "支出" && (threeDayImpulse || budgetFriction),
    reflectionPhrase = "我承认这笔开销无法带给我持久的快乐";
  const budgetLevel = (name: Category) => {
    const limit =
      categoryBudgetList.find((item) => item.category === name)?.amount ?? 0;
    const ratio = limit ? categorySpend[name] / limit : 0;
    return ratio >= 1 ? "danger" : ratio >= 0.8 ? "warning" : "safe";
  };
  const selectedIncomeCategory = incomeCategoryList.find(
    (item) => item.name === incomeCategory,
  );

  return (
    <main className="shell finance-shell" data-theme={theme}>
      <Script
        src="https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js"
        strategy="afterInteractive"
        onLoad={() => setChartReady(true)}
      />
      {toast && (
        <div className={`ledger-toast ${toast.kind}`} role="status">
          <span>{toast.kind === "warning" ? "💡" : "✓"}</span>
          <div>
            <strong>
              {toast.kind === "warning" ? "温馨提示" : "操作成功"}
            </strong>
            <p>{toast.message}</p>
          </div>
          <button onClick={() => setToast(null)}>×</button>
        </div>
      )}
      {locked && (
        <div className="privacy-wall">
          <div className="lock-panel">
            <div className="lock-orb">◉</div>
            <p className="eyebrow">PRIVACY GUARD</p>
            <h2>NeoLedger 已锁定</h2>
            <p>你的财务秘密正在毛玻璃后安全休息。</p>
            <input
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
              onKeyDown={(event) =>
                event.key === "Enter" && pin.length === 4 && unlock()
              }
              inputMode="numeric"
              type="password"
              placeholder="••••"
              autoFocus
            />
            <button onClick={unlock} disabled={pin.length !== 4 || pending}>
              解锁账本
            </button>
            {lockError && <span>{lockError}</span>}
          </div>
        </div>
      )}
      <section
        className={`app-frame finance-frame ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
        data-module={tab}
      >
        <header className="topbar finance-topbar">
          <button
            className="sidebar-collapse"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
          <div className="sidebar-top-actions">
            <button
              aria-label="切换账本"
              title="切换账本"
              onClick={() => openDialog(ledgerMenuRef, setLedgerMenuOpen)}
            >
              {ledgers.find((item) => item.id === currentLedgerId)?.icon ?? "📚"}
            </button>
            <button
              aria-label="数据中心"
              title="数据中心"
              onClick={() => openDialog(dataRef, setDataOpen)}
            >
              💾
            </button>
            <button
              className="notice-button"
              aria-label="系统通知"
              title="系统通知"
              onClick={() => {
                openDialog(noticeRef, setNoticeOpen);
                void fetch("/api/notifications", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ledgerId: currentLedgerId }),
                });
                setSystemNotices((rows) =>
                  rows.map((item) => ({ ...item, read: true })),
                );
              }}
            >
              🔔
              {(pendingFlows.length > 0 ||
                systemNotices.some((item) => !item.read)) && (
                <i className="alert-dot" />
              )}
            </button>
            <button
              aria-label="美学实验室"
              title="美学实验室"
              onClick={() => openDialog(aestheticRef, setAestheticOpen)}
            >
              🎨
            </button>
          </div>
          <nav className="module-nav" aria-label="财务模块">
            <button
              className={tab === "dashboard" ? "active" : ""}
              onClick={() => setTab("dashboard")}
              title="主界面"
            >
              <span>⌂</span><b>主界面</b>
            </button>
            <button
              className={tab === "assets" ? "active" : ""}
              onClick={() => setTab("assets")}
              title="个人资产"
            >
              <span>◈</span><b>个人资产</b>
            </button>
            <button
              className={tab === "bills" ? "active" : ""}
              onClick={() => setTab("bills")}
              title="个人账单"
            >
              <span>▤</span><b>个人账单</b>
            </button>
            <button
              className={tab === "planning" ? "active" : ""}
              onClick={() => setTab("planning")}
              title="管理规划"
            >
              <span>▦</span><b>管理规划</b>
            </button>
            <button
              className={tab === "analytics" ? "active" : ""}
              onClick={() => setTab("analytics")}
              title="统计分析"
            >
              <span>◔</span><b>统计分析</b>
            </button>
          </nav>
          <div className="sidebar-profile">
            <div className="avatar">☺</div>
            <div>
              <strong>我的财务舱</strong>
              <small>数据仅保存在你的空间</small>
            </div>
          </div>
        </header>
        <div className="finance-content">
        {(installPrompt || offlineCount > 0) && (
          <div className="pwa-banner">
            <span>
              {offlineCount > 0
                ? `☁️ ${offlineCount} 笔离线账单等待同步`
                : "📲 把 NeoLedger 装进主屏幕，像原生 App 一样使用"}
            </span>
            {installPrompt && (
              <button
                onClick={async () => {
                  await installPrompt.prompt();
                  const result = await installPrompt.userChoice;
                  if (result.outcome === "accepted") setInstallPrompt(null);
                }}
              >
                添加到主屏幕
              </button>
            )}
            {offlineCount > 0 && isOnline && (
              <button onClick={() => void syncOfflineEntries()}>
                立即同步
              </button>
            )}
          </div>
        )}

        <div className="module-heading">
          <p className="eyebrow">
            {tab === "dashboard"
              ? "NEO LEDGER HOME"
              : tab === "assets"
              ? "PERSONAL WEALTH"
              : tab === "bills"
                ? "PERSONAL BILLS"
              : tab === "planning"
                ? "PLANNING & CONTROL"
                : "INSIGHTS & FORECAST"}
          </p>
          <h2>
            {tab === "dashboard"
              ? "主界面"
              : tab === "assets"
              ? "个人资产"
              : tab === "bills"
                ? "个人账单"
              : tab === "planning"
                ? "管理规划"
                : "统计分析"}
          </h2>
        </div>

        {tab === "dashboard" && (
          <section className="dashboard-home">
            {comfortMessage.body && (
              <article className="comfort-inline-card">
                <div className="comfort-moon-large" aria-hidden="true">🌙</div>
                <div>
                  <p className="eyebrow">{comfortMessage.eyebrow}</p>
                  <h2>{comfortMessage.title}</h2>
                  <p>{comfortMessage.body}</p>
                </div>
              </article>
            )}
            <article className="daily-report-card">
              <header>
                <span>☀️</span>
                <div>
                  <p className="eyebrow">DAILY FINANCE</p>
                  <h2>每日财报</h2>
                </div>
                <time>{todayKey || "今天"}</time>
              </header>
              <div className="daily-report-metrics">
                <div>
                  <span>今日收入</span>
                  <strong>
                    {money.format((periodReports?.daily.income ?? 0) / 100)}
                  </strong>
                </div>
                <div>
                  <span>今日支出</span>
                  <strong>
                    {money.format((periodReports?.daily.expense ?? 0) / 100)}
                  </strong>
                </div>
                <div>
                  <span>今日结余</span>
                  <strong
                    className={
                      (periodReports?.daily.balance ?? 0) >= 0
                        ? "positive"
                        : "negative"
                    }
                  >
                    {money.format((periodReports?.daily.balance ?? 0) / 100)}
                  </strong>
                </div>
              </div>
              <p className="daily-report-copy">
                {!periodReports
                  ? "正在整理今天的资金流…"
                  : !periodReports.daily.count
                    ? "今天还没有收支记录。钱包也需要安静的一天，慢一点完全没关系。"
                    : periodReports.daily.balance >= 0
                      ? `今天记录了 ${periodReports.daily.count} 笔收支，并留下了 ${money.format(periodReports.daily.balance / 100)}。认真生活，也认真留住了一点余地。`
                      : `今天记录了 ${periodReports.daily.count} 笔收支，支出暂时比收入多 ${money.format(Math.abs(periodReports.daily.balance) / 100)}。这只是一天的数字，不是对你的评价。`}
              </p>
              {periodReports?.daily.topCategory && (
                <small>
                  今日主要支出 · {periodReports.daily.topCategory}{" "}
                  {money.format(periodReports.daily.topCategoryAmount / 100)}
                </small>
              )}
            </article>
          </section>
        )}

        {(tab === "dashboard" ||
          tab === "assets" ||
          tab === "bills" ||
          tab === "planning") && (
          <>
            {warnings.map(({ account, days }) => (
              <div className="repayment-alert module-planning" key={account.id}>
                <span>⚠️</span>
                <strong>还款预警：</strong>您的{account.name}还有 {days}{" "}
                天还款，请注意打款！
              </div>
            ))}
            <section className="finance-hero">
              <article className="net-card module-assets">
                <div className="rank-ticker">
                  🎖️ 当前段位 · {rank}{" "}
                  <button
                    onClick={() => {
                      setBadgeFocusCode(null);
                      openDialog(badgeRef, setBadgeOpen);
                    }}
                  >
                    勋章墙
                  </button>
                </div>
                <p>可用净资产</p>
                <strong>
                  {money.format((assetTotal - liabilityTotal) / 100)}
                </strong>
                <div>
                  <span>总资产 {money.format(assetTotal / 100)}</span>
                  <span>待还负债 {money.format(liabilityTotal / 100)}</span>
                </div>
                <div className="digital-worth-breakdown">
                  <span>🏦 金融账户</span>
                  <b>{money.format(financialAssetTotal / 100)}</b>
                  <span>⌁ 固定 / 数字资产</span>
                  <b>{money.format(digitalAssetTotal / 100)}</b>
                </div>
                <div className="real-worth">
                  <span>📉 一年后真实购买力净资产</span>
                  <b>{money.format(realNetWorthOneYear / 100)}</b>
                  <small>
                    按年化通胀率 {(inflationRate * 100).toFixed(1)}% 贴现
                  </small>
                </div>
                <form action={saveInflation} className="inflation-setting">
                  <label>
                    预期年化通胀率{" "}
                    <input
                      name="inflationRate"
                      type="number"
                      min="0"
                      max="50"
                      step="0.1"
                      defaultValue={(inflationRate * 100).toFixed(1)}
                    />
                    %
                  </label>
                  <button disabled={pending}>校准</button>
                </form>
              </article>
              <article className="budget-mini-card module-planning">
                <div>
                  <p>本月预算</p>
                  <button onClick={() => openDialog(budgetRef, setBudgetOpen)}>
                    调整
                  </button>
                </div>
                <strong>{money.format(budget / 100)}</strong>
                <div className="progress-track">
                  <div
                    className="progress-value"
                    style={{
                      width: `${Math.min(100, (monthExpense / budget) * 100)}%`,
                    }}
                  />
                </div>
                <small>
                  已使用 {money.format(monthExpense / 100)} ·{" "}
                  {Math.round((monthExpense / budget) * 100)}%
                </small>
              </article>
              <article className="subscription-section top-subscription module-planning">
                <div className="section-heading account-heading">
                  <div>
                    <p className="eyebrow">AUTO PAY</p>
                    <h2>我的续费</h2>
                  </div>
                  <button
                    className="new-account-button"
                    onClick={() => {
                      setEditingSubscription(null);
                      setSubscriptionError("");
                      setSubscriptionCategory(categories[0] ?? "");
                      setSubscriptionCategoryOpen(false);
                      setSubscriptionCategoryError("");
                      openDialog(subscriptionRef, setSubscriptionOpen);
                    }}
                  >
                    ＋ 添加
                  </button>
                </div>
                <div className="subscription-list">
                  {subscriptionList.length ? (
                    subscriptionList.map((item) => {
                      const anchor = todayKey
                          ? new Date(`${todayKey}T00:00:00`)
                          : new Date(),
                        expiresAt = new Date(`${item.nextChargeDate}T00:00:00`),
                        daysLeft = Math.ceil(
                          (expiresAt.getTime() - anchor.getTime()) / 86400000,
                        ),
                        expiryStatus =
                          daysLeft < 0
                            ? `已到期 ${Math.abs(daysLeft)} 天`
                            : daysLeft === 0
                              ? "今天到期"
                              : daysLeft <= 30
                                ? `${daysLeft} 天后到期`
                                : `${Math.ceil(daysLeft / 30)} 个月后到期`,
                        dailyCost =
                          item.amount /
                          (item.cycle === "每月"
                            ? 30
                            : item.cycle === "每季"
                              ? 91
                              : 365);
                      return (
                        <article
                          className={`${daysLeft < 0 ? "expired" : daysLeft <= 7 ? "expiring" : ""}`}
                          key={item.id}
                        >
                          <span>{categoryMeta[item.category].emoji}</span>
                          <div className="subscription-info">
                            <strong>{item.name}</strong>
                            <small>
                              到期 {item.nextChargeDate.replaceAll("-", ".")} ·{" "}
                              <i>{expiryStatus}</i>
                            </small>
                          </div>
                          <div className="subscription-cost">
                            <b>{money.format(item.amount / 100)}</b>
                            <em>
                              {item.cycle} · 约 {money.format(dailyCost / 100)}/天
                            </em>
                          </div>
                          <div className="subscription-actions">
                            <button
                              aria-label={`修改${item.name}`}
                              title="修改续费"
                              onClick={() => {
                                setEditingSubscription(item);
                                setSubscriptionError("");
                                setSubscriptionCategory(item.category);
                                setSubscriptionCategoryOpen(false);
                                setSubscriptionCategoryError("");
                                openDialog(
                                  subscriptionRef,
                                  setSubscriptionOpen,
                                );
                              }}
                            >
                              ✎
                            </button>
                            <button
                              aria-label={`删除${item.name}`}
                              title="删除续费"
                              onClick={() => removeSubscription(item.id)}
                            >
                              ×
                            </button>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <p className="subscription-empty">
                      暂无固定开销，生活暂时没有自动吸金兽。
                    </p>
                  )}
                </div>
              </article>
            </section>

            <section className="neo-ai-hub module-dashboard">
              <div className="ai-hub-head">
                <div>
                  <p className="eyebrow">PRIVATE RAG FINANCE COPILOT</p>
                  <h2>💬 NeoAI 财富智囊</h2>
                  <span>
                    只读取聚合财务摘要 · 支持未来接入 NAS Ollama / Llama3
                  </span>
                </div>
                <i>✦</i>
              </div>
              <div className="ai-chat-stream">
                {chatMessages.map((item, index) => (
                  <article className={item.role} key={index}>
                    <span>{item.role === "assistant" ? "N" : "我"}</span>
                    <p>{item.content}</p>
                  </article>
                ))}
                {pending && chatMessages.at(-1)?.role === "user" && (
                  <article className="assistant">
                    <span>N</span>
                    <p>正在盘问你的钱包，它似乎有点心虚……</p>
                  </article>
                )}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  askNeoAi();
                }}
              >
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="问问：按现在速度，我多久能买得起新 Mac？"
                />
                <button disabled={pending || !chatInput.trim()}>发送 ↗</button>
              </form>
              <div className="ai-quick-prompts">
                {[
                  "哪部分钱花得最冤？",
                  "帮我诊断负债风险",
                  "我的存钱速度健康吗？",
                ].map((text) => (
                  <button onClick={() => setChatInput(text)} key={text}>
                    {text}
                  </button>
                ))}
              </div>
            </section>

            <section className="accounts-section module-assets">
              <div className="section-heading account-heading">
                <div>
                  <p className="eyebrow">MONEY POCKETS</p>
                  <h2>我的账户</h2>
                </div>
                <div className="account-heading-actions">
                  <button
                    className="new-account-button"
                    onClick={() => {
                      setAccountError("");
                      openDialog(transferRef, setTransferOpen);
                    }}
                  >
                    ⇄ 账户转账
                  </button>
                  <button
                    className="new-account-button"
                    onClick={() => showAccountDialog(null)}
                  >
                    ＋ 新增账户
                  </button>
                </div>
              </div>
              <div className="account-grid">
                {accountList.map((account) => {
                  const due = warnings.find(
                    (item) => item.account.id === account.id,
                  );
                  return (
                    <button
                      type="button"
                      className={`account-card ${account.type === "负债" ? "debt" : ""} ${account.isInvestment ? "investment" : ""}`}
                      key={account.id}
                      onClick={() => showAccountDialog(account)}
                    >
                      <div className="account-icon">{account.icon}</div>
                      <div>
                        <p>{account.name}</p>
                        <strong>
                          {formatCurrency(
                            (account.type === "负债"
                              ? Math.abs(account.currentBalance)
                              : account.currentBalance) / 100,
                            account.currency,
                          )}
                        </strong>
                        {account.currency !== "CNY" && (
                          <small>
                            {account.currency} · 折合{" "}
                            {money.format(
                              (Math.abs(account.currentBalance) *
                                exchangeRates[account.currency]) /
                                100,
                            )}
                          </small>
                        )}
                      </div>
                      {account.isInvestment ? (
                        <div className="investment-metrics">
                          <span>
                            累计收益{" "}
                            {money.format(account.cumulativeIncome / 100)}
                          </span>
                          <b>
                            模拟年化{" "}
                            {account.initialBalance
                              ? (
                                  (account.cumulativeIncome /
                                    Math.abs(account.initialBalance)) *
                                  12 *
                                  100
                                ).toFixed(2)
                              : "0.00"}
                            %
                          </b>
                        </div>
                      ) : account.type === "负债" ? (
                        <div className={`account-due ${due ? "urgent" : ""}`}>
                          <span>
                            {account.billDay}日账单 · {account.repaymentDay}
                            日还款
                          </span>
                          <b>
                            {due ? `还有 ${due.days} 天还款` : "还款日正常"}
                          </b>
                        </div>
                      ) : (
                        <span>资产账户 · 点击管理</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="digital-assets-section module-assets">
              <div className="section-heading account-heading">
                <div>
                  <p className="eyebrow">DEPRECIATION VAULT</p>
                  <h2>数码与虚拟资产配置</h2>
                  <span className="section-subline">
                    多系数加速折旧 · 当前残值合计 {money.format(digitalAssetTotal / 100)}
                  </span>
                </div>
                <button
                  className="new-account-button"
                  onClick={() => {
                    setAssetType("数码设备");
                    setAssetError("");
                    openDialog(assetRef, setAssetOpen);
                  }}
                >
                  ＋ 添置新装备
                </button>
              </div>
              <div className="asset-shelf">
                {digitalAssetList.length ? (
                  digitalAssetList.map((asset) => {
                    const icon =
                      asset.assetType === "游戏账号"
                        ? "🎮"
                        : asset.assetType === "潮流玩具"
                          ? "🏍️"
                          : "💻";
                    return (
                      <article className="digital-asset-card" key={asset.id}>
                        <div className="asset-card-top">
                          <span className="asset-device-icon">{icon}</span>
                          <div>
                            <p>{asset.assetType}</p>
                            <h3>{asset.name}</h3>
                          </div>
                          {asset.heatLevel && (
                            <b className={`heat-badge heat-${asset.heatLevel}`}>
                              {asset.heatLevel}热度
                            </b>
                          )}
                        </div>
                        <div className="asset-value-pair">
                          <span>
                            购入原值<b>{money.format(asset.purchasePrice / 100)}</b>
                          </span>
                          <i>→</i>
                          <span>
                            当前估值<strong>{money.format(asset.currentValue / 100)}</strong>
                          </span>
                        </div>
                        <div className="value-loss-copy">
                          <span>价值流失 {asset.lossPercent.toFixed(1)}%</span>
                          <b>-{money.format(asset.valueLost / 100)}</b>
                        </div>
                        <div className="value-loss-track">
                          <i style={{ width: `${Math.min(100, asset.lossPercent)}%` }} />
                        </div>
                        <div className="depreciation-note">
                          <span>⌁</span>
                          <p>
                            平均每天折旧损耗
                            <b>{money.format(asset.dailyDepreciation / 100)}</b>
                          </p>
                        </div>
                        <div className="asset-card-meta">
                          <span>购于 {asset.purchaseDate}</span>
                          <span>
                            寿命 {asset.lifespanMonths} 月 · 残值率 {asset.residualRateBps / 100}%
                          </span>
                        </div>
                        <button
                          className="liquidate-button"
                          onClick={() => showLiquidation(asset)}
                        >
                          🛒 一键变现 / 报废
                        </button>
                      </article>
                    );
                  })
                ) : (
                  <div className="asset-shelf-empty">
                    <span>⌁</span>
                    <strong>资产货架还是空的</strong>
                    <p>把手机、主机或游戏账号放进来，看看时间每天带走了多少钱。</p>
                  </div>
                )}
              </div>
            </section>

            <section className="settlement-section module-planning">
              <div className="section-heading account-heading">
                <div>
                  <p className="eyebrow">SPLIT & SETTLE</p>
                  <h2>分账搭子 · 即时清算</h2>
                </div>
                <button className="new-account-button" onClick={addMember}>
                  ＋ 添加成员
                </button>
              </div>
              <div className="member-chips">
                {memberList.map((item) => (
                  <span key={item.id}>
                    {item.icon} {item.name}
                    {item.isMe ? " · 本人" : ""}
                  </span>
                ))}
              </div>
              <div className="settlement-grid">
                {settlements.length ? (
                  settlements.map(({ member, balance }) => (
                    <article
                      className={balance < 0 ? "owe" : ""}
                      key={member.id}
                    >
                      <div>
                        <span>{member.icon}</span>
                        <p>
                          {balance > 0 ? (
                            <>目前「{member.name}」应给你转账</>
                          ) : (
                            <>你还欠「{member.name}」</>
                          )}
                        </p>
                      </div>
                      <strong>{money.format(Math.abs(balance) / 100)}</strong>
                      <button
                        onClick={() => settle(member.id, balance)}
                        disabled={pending}
                      >
                        一键清算 / 平账
                      </button>
                    </article>
                  ))
                ) : (
                  <article className="settled">
                    <div>
                      <span>🤝</span>
                      <p>当前人情往来已全部清爽平账</p>
                    </div>
                    <strong>¥0.00</strong>
                  </article>
                )}
              </div>
            </section>

            <section className="goals-section module-planning">
              <div className="section-heading account-heading">
                <div>
                  <p className="eyebrow">DREAM VAULT</p>
                  <h2>心愿储蓄罐</h2>
                </div>
                <button
                  className="new-account-button"
                  onClick={() => {
                    setSavingGoal(null);
                    setGoalError("");
                    openDialog(goalRef, setGoalOpen);
                  }}
                >
                  ＋ 新心愿
                </button>
              </div>
              <div className="goal-grid">
                {goalList.length ? (
                  goalList.map((goal) => {
                    const percent = Math.min(
                      100,
                      Math.round((goal.savedAmount / goal.targetAmount) * 100),
                    );
                    return (
                      <article
                        className={`goal-card ${percent >= 100 ? "completed" : ""}`}
                        key={goal.id}
                      >
                        {percent >= 100 && (
                          <div className="fireworks">✦ ✧ ✦</div>
                        )}
                        <div className="goal-orb">
                          <span>{goal.icon}</span>
                          <i style={{ height: `${percent}%` }} />
                        </div>
                        <div>
                          <h3>{goal.name}</h3>
                          <p>
                            {money.format(goal.savedAmount / 100)} /{" "}
                            {money.format(goal.targetAmount / 100)}
                          </p>
                          <div className="goal-track">
                            <i style={{ width: `${percent}%` }} />
                          </div>
                          <small>
                            {percent}% · 截止 {goal.deadline}
                          </small>
                        </div>
                        <button
                          onClick={() => {
                            setSavingGoal(goal);
                            setGoalError("");
                            openDialog(goalRef, setGoalOpen);
                          }}
                        >
                          {percent >= 100 ? "管理" : "存一笔"}
                        </button>
                      </article>
                    );
                  })
                ) : (
                  <p className="subscription-empty">
                    还没有心愿。给未来的快乐先留一个位置吧。
                  </p>
                )}
              </div>
            </section>

            <section className="installment-section module-planning">
              <div className="section-heading account-heading">
                <div>
                  <p className="eyebrow">DEBT AMORTIZATION</p>
                  <h2>📈 负债摊销沙盘</h2>
                </div>
                <button
                  className="new-account-button"
                  onClick={() => openDialog(installmentRef, setInstallmentOpen)}
                >
                  ＋ 新增分期
                </button>
              </div>
              <div className="installment-grid">
                {installmentList.length ? (
                  installmentList.map((item) => {
                    const grand = item.totalAmount + item.feeAmount,
                      paid = Math.round(
                        (grand * item.paidPeriods) / item.periods,
                      ),
                      percent = Math.round(
                        (item.paidPeriods / item.periods) * 100,
                      );
                    const end = new Date(`${item.startMonth}-01T12:00:00`);
                    end.setMonth(end.getMonth() + item.periods - 1);
                    return (
                      <article key={item.id}>
                        <div className="installment-title">
                          <span>💳</span>
                          <div>
                            <h3>{item.name}</h3>
                            <p>
                              {item.periods} 期 · 手续费{" "}
                              {formatCurrency(
                                item.feeAmount / 100,
                                item.currency,
                              )}
                            </p>
                          </div>
                          <b>{percent}%</b>
                        </div>
                        <div className="amortization-track">
                          <i style={{ width: `${percent}%` }} />
                        </div>
                        <div className="installment-stats">
                          <span>
                            已还{" "}
                            <b>{formatCurrency(paid / 100, item.currency)}</b>
                          </span>
                          <span>
                            剩余{" "}
                            <b>
                              {formatCurrency(
                                (grand - paid) / 100,
                                item.currency,
                              )}
                            </b>
                          </span>
                          <span>
                            进度{" "}
                            <b>
                              {item.paidPeriods}/{item.periods}期
                            </b>
                          </span>
                        </div>
                        <small>
                          预计 {end.getFullYear()}年{end.getMonth() + 1}月
                          无债一身轻
                        </small>
                      </article>
                    );
                  })
                ) : (
                  <div className="installment-empty">
                    当前没有分期项目。保持这份清醒，未来的工资都属于你。
                  </div>
                )}
              </div>
            </section>

            <section className="control-grid module-planning">
              <div className="category-budget-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">BUDGET CONTROL</p>
                    <h2>品类预算控制塔</h2>
                  </div>
                </div>
                <div className="category-budget-grid">
                  {categories.map((item) => {
                    const limit =
                      categoryBudgetList.find((row) => row.category === item)
                        ?.amount ?? 0;
                    const ratio = limit ? categorySpend[item] / limit : 0;
                    const level = budgetLevel(item);
                    return (
                      <form
                        action={saveCategoryBudget}
                        className={`category-budget-card ${level}`}
                        key={item}
                      >
                        <input type="hidden" name="category" value={item} />
                        <div>
                          <span>
                            {categoryMeta[item].emoji} {item}
                          </span>
                          <b>
                            {limit ? `${Math.round(ratio * 100)}%` : "未设置"}
                          </b>
                        </div>
                        <div className="category-budget-track">
                          <i
                            style={{ width: `${Math.min(100, ratio * 100)}%` }}
                          />
                        </div>
                        <small>
                          {money.format(categorySpend[item] / 100)} /{" "}
                        </small>
                        <input
                          name="amount"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={(limit / 100).toFixed(0)}
                          aria-label={`${item}预算`}
                        />
                        <button>保存</button>
                        {level === "danger" && (
                          <p>警报！{item}预算已烧光，请强制开启搬砖模式！</p>
                        )}
                      </form>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="ledger-section module-bills">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">TRANSACTION SEARCH</p>
                  <h2>账单明细</h2>
                </div>
                <span>
                  {billResults.rows.length} / {transactions.length} 笔记录
                </span>
              </div>
              <div className="bill-query-panel">
                <label className="bill-search-box">
                  <span>⌕</span>
                  <input
                    value={billQuery}
                    onChange={(event) => setBillQuery(event.target.value)}
                    placeholder="搜索商户、分类、账户、金额或日期"
                    aria-label="搜索账单明细"
                  />
                  {billQuery && (
                    <button onClick={() => setBillQuery("")} aria-label="清空搜索">
                      ×
                    </button>
                  )}
                </label>
                <div className="bill-range-tabs" aria-label="账单时间范围">
                  {(
                    [
                      ["all", "全部"],
                      ["day", "本日"],
                      ["week", "本周"],
                      ["month", "本月"],
                      ["year", "本年"],
                      ["other-year", "其他年份"],
                      ["custom", "自定义"],
                    ] as [BillRange, string][]
                  ).map(([value, label]) => (
                    <button
                      className={billRange === value ? "active" : ""}
                      onClick={() => setBillRange(value)}
                      key={value}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {billRange === "other-year" && (
                  <div className="bill-advanced-filter bill-year-filter">
                    <span>选择年份</span>
                    <select
                      value={
                        billYear ||
                        String(
                          availableBillYears.find(
                            (year) => year !== new Date().getFullYear(),
                          ) ??
                            availableBillYears[0] ??
                            new Date().getFullYear(),
                        )
                      }
                      onChange={(event) => setBillYear(event.target.value)}
                    >
                      {availableBillYears.map((year) => (
                        <option value={year} key={year}>
                          {year} 年
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {billRange === "custom" && (
                  <div className="bill-advanced-filter bill-custom-range">
                    <label>
                      <span>开始日期</span>
                      <input
                        type="date"
                        value={billStartDate}
                        max={billEndDate || undefined}
                        onChange={(event) => setBillStartDate(event.target.value)}
                      />
                    </label>
                    <i>至</i>
                    <label>
                      <span>结束日期</span>
                      <input
                        type="date"
                        value={billEndDate}
                        min={billStartDate || undefined}
                        onChange={(event) => setBillEndDate(event.target.value)}
                      />
                    </label>
                    {(billStartDate || billEndDate) && (
                      <button
                        onClick={() => {
                          setBillStartDate("");
                          setBillEndDate("");
                        }}
                      >
                        清除日期
                      </button>
                    )}
                  </div>
                )}
                <div className="bill-result-summary">
                  <div>
                    <span>筛选收入</span>
                    <strong className="income">
                      {money.format(billResults.income / 100)}
                    </strong>
                  </div>
                  <div>
                    <span>筛选支出</span>
                    <strong>{money.format(billResults.expense / 100)}</strong>
                  </div>
                  <div>
                    <span>净收支</span>
                    <strong className={billResults.balance >= 0 ? "income" : "expense"}>
                      {money.format(billResults.balance / 100)}
                    </strong>
                  </div>
                </div>
              </div>
              {billResults.rows.length ? (
                <div className="expense-list">
                  {billResults.rows.map((item) => {
                    const account = accountList.find(
                      (one) => one.id === item.accountId,
                    );
                    const icon =
                      item.type === "收入"
                        ? incomeMeta[item.incomeCategory ?? "其它收入"].emoji
                        : categoryMeta[item.category ?? "餐饮"].emoji;
                    return (
                      <article className="expense-item" key={item.id}>
                        <div className="expense-icon category-icon">{icon}</div>
                        <div className="expense-main">
                          <h3>{item.title}</h3>
                          <p>
                            {dateLabels[item.id] ?? "记录时间"} ·{" "}
                            {account?.name} ·{" "}
                            {item.type === "收入"
                              ? item.incomeCategory
                              : item.category}
                          </p>
                        </div>
                        <span
                          className={`flow-type ${item.type === "收入" ? "income" : ""}`}
                        >
                          {item.type}
                        </span>
                        <strong
                          className={item.type === "收入" ? "income-money" : ""}
                        >
                          {item.type === "收入" ? "+" : "-"}
                          {formatCurrency(item.amount / 100, item.currency)}
                          {item.currency !== "CNY" && (
                            <small className="converted-money">
                              折合{" "}
                              {money.format(
                                (item.amount * exchangeRates[item.currency]) /
                                  100,
                              )}
                            </small>
                          )}
                        </strong>
                        <button
                          className="delete-button"
                          aria-label={`删除${item.title}`}
                          disabled={pending}
                          onClick={() => requestDeleteTransaction(item.id)}
                        >
                          🗑
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : transactions.length ? (
                <div className="bill-no-results">
                  <span>⌕</span>
                  <h3>没有找到匹配的账单</h3>
                  <p>试试更换关键词或放宽时间范围。</p>
                  <button
                    onClick={() => {
                      setBillQuery("");
                      setBillRange("all");
                      setBillStartDate("");
                      setBillEndDate("");
                    }}
                  >
                    重置筛选
                  </button>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-flower">✿</div>
                  <h3>财务舱等待第一笔数据</h3>
                  <p>记一笔，让账户和分析系统开始运转。</p>
                  <button onClick={() => openDialog(entryRef, setEntryOpen)}>
                    开始记账
                  </button>
                </div>
              )}
            </section>
          </>
        )}
        {(tab === "planning" || tab === "analytics") && (
          <section className="analytics-page">
            <div className="analytics-head">
              <div>
                <p className="eyebrow">FULL SPECTRUM ANALYTICS</p>
                <h2>动态财务分析</h2>
                <span>
                  {dimension}维度 · 收入{" "}
                  {money.format(analysis.incomeTotal / 100)} · 支出{" "}
                  {money.format(analysis.expenseTotal / 100)}
                </span>
              </div>
              <div className="dimension-switch">
                {(["日", "月", "年"] as Dimension[]).map((item) => (
                  <button
                    className={dimension === item ? "active" : ""}
                    onClick={() => setDimension(item)}
                    key={item}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="pro-chart-grid">
              <article className="pro-chart-card line-card trend-card">
                <div>
                  <h3>资产资金趋势</h3>
                  <p>橙色支出 · 绿色收入 · 渐变阴影</p>
                </div>
                <div className="canvas-wrap line-wrap">
                  <canvas ref={lineCanvas} />
                </div>
              </article>
              <article className="pro-chart-card">
                <div>
                  <h3>支出分类 × 情绪双环</h3>
                  <p>外环消费分类，内环情绪成分</p>
                </div>
                <div className="canvas-wrap">
                  <canvas ref={pieCanvas} />
                </div>
              </article>
              <article className="pro-chart-card">
                <div>
                  <h3>收入来源结构</h3>
                  <p>薪资、理财、兼职与其它收入</p>
                </div>
                <div className="canvas-wrap">
                  <canvas ref={moodCanvas} />
                </div>
              </article>
            </div>
            <article className="allocation-tower">
              <div>
                <p className="eyebrow">ALL WEATHER ALLOCATION</p>
                <h3>⚖️ 智能资产调仓控制塔</h3>
                <span>参考全天候思想的本地资产大类诊断，不构成投资建议</span>
              </div>
              <div className="allocation-bars">
                {allocation.map((item) => (
                  <section key={item.name}>
                    <div>
                      <span>
                        {item.name === "现金流"
                          ? "💧"
                          : item.name === "固收防守"
                            ? "🛡️"
                            : "🚀"}{" "}
                        {item.name}
                      </span>
                      <b>
                        {((item.amount / allocationTotal) * 100).toFixed(1)}%
                      </b>
                    </div>
                    <div>
                      <i
                        className={
                          item.name === "现金流"
                            ? "cash"
                            : item.name === "固收防守"
                              ? "fixed"
                              : "risk"
                        }
                        style={{
                          width: `${(item.amount / allocationTotal) * 100}%`,
                        }}
                      />
                    </div>
                    <small>{money.format(item.amount / 100)}</small>
                  </section>
                ))}
              </div>
              {cashRatio > 70 && (
                <div className="allocation-warning gold">
                  ! 资产闲置预警：现金类资产占 {cashRatio.toFixed(1)}%，建议将约{" "}
                  {(cashRatio - 50).toFixed(1)}%
                  转换为固收或与你风险承受力匹配的低风险资产。
                </div>
              )}
              {debtRatio >= 40 && (
                <div className="allocation-warning red">
                  ! 安全降杠杆警报：负债已达到总资产的 {debtRatio.toFixed(1)}
                  %，请优先偿还高息负债。
                </div>
              )}
              {cashRatio <= 70 && debtRatio < 40 && (
                <div className="allocation-warning green">
                  资产结构处于可控区间。继续保持现金、固收和风险资产之间的缓冲层。
                </div>
              )}
            </article>
            <article className="fire-dashboard module-planning">
              <div className="fire-head">
                <div>
                  <p className="eyebrow">FIRE FLIGHT PLAN</p>
                  <h3>🌅 FIRE 赛博退休终极航线</h3>
                  <span>
                    4% 原则目标 · 当前年化假设{" "}
                    {(fireConfig.annualReturnBps / 100).toFixed(1)}%
                  </span>
                </div>
                <div
                  className="fire-score"
                  style={{ "--fire": fireProgress } as React.CSSProperties}
                >
                  <strong>{fireProgress.toFixed(1)}%</strong>
                  <small>安全躺平指数</small>
                </div>
              </div>
              <form action={saveFire}>
                <label>
                  <span>理想退休月开销</span>
                  <input
                    name="monthlyExpense"
                    type="number"
                    min="100"
                    step="100"
                    defaultValue={(fireConfig.monthlyExpense / 100).toFixed(0)}
                  />
                </label>
                <label>
                  <span>预计年化收益率</span>
                  <input
                    name="annualReturn"
                    type="number"
                    min="0"
                    max="30"
                    step="0.1"
                    defaultValue={(fireConfig.annualReturnBps / 100).toFixed(1)}
                  />
                </label>
                <button disabled={pending}>重算航线</button>
              </form>
              <div className="fire-numbers">
                <div>
                  <span>FIRE 终极数字</span>
                  <strong>{money.format(fireTarget / 100)}</strong>
                </div>
                <div>
                  <span>当前净资产</span>
                  <strong>{money.format(netWorthCny / 100)}</strong>
                </div>
                <div>
                  <span>距离退休星港</span>
                  <strong>
                    {money.format(Math.max(0, fireTarget - netWorthCny) / 100)}
                  </strong>
                </div>
              </div>
              <div className="fire-route">
                <i style={{ width: `${fireProgress}%` }} />
                <svg
                  viewBox="0 0 1000 180"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d="M10 160 C 210 150, 270 115, 410 110 S 650 70, 760 62 S 910 20, 990 12" />
                </svg>
                {(
                  [
                    {
                      at: Math.min(
                        18,
                        ((fireConfig.monthlyExpense * 6) / fireTarget) * 100,
                      ),
                      name: "半年备用金",
                      done: netWorthCny >= fireConfig.monthlyExpense * 6,
                    },
                    { at: 35, name: "摆脱被动负债", done: liabilityTotal <= 0 },
                    { at: 60, name: "基础生存自由", done: fireProgress >= 60 },
                    { at: 96, name: "终极赛博退休", done: fireProgress >= 100 },
                  ] as { at: number; name: string; done: boolean }[]
                ).map((item) => (
                  <div
                    className={`fire-node ${item.done ? "done" : ""}`}
                    style={{ left: `${item.at}%` }}
                    key={item.name}
                  >
                    <b>{item.done ? "✦" : "○"}</b>
                    <span>{item.name}</span>
                  </div>
                ))}
              </div>
              <p>
                按 4% 提取率估算，你的目标资产约为理想年开销的 25
                倍。收益率用于展示预期，不改变 4% 目标数字，也不构成收益承诺。
              </p>
            </article>
            <article className="forecast-card">
              <div className="forecast-head">
                <div>
                  <p className="eyebrow">FUTURE VISION</p>
                  <h3>🔮 未来视界 · 现金流预测</h3>
                  <span>净资产 + 近 90 天烧钱速度 + 固定订阅</span>
                </div>
                <div className="forecast-pills">
                  <span>3个月</span>
                  <span>6个月</span>
                  <span>12个月</span>
                </div>
              </div>
              <div className="canvas-wrap forecast-wrap">
                <canvas ref={forecastCanvas} />
              </div>
              {forecast?.bankruptcyDate ? (
                <div className="bankruptcy-alert">
                  ! 破产预警：按照您当前的烧钱速度，您的资产将在{" "}
                  {forecast.bankruptcyDate} 耗尽，请立刻开启省钱模式！
                </div>
              ) : (
                <div className="lighthouse">
                  资产灯塔：您的财务状况极其健康，目前资金足以支撑您无收入躺平{" "}
                  {forecast?.runwayDays ?? "计算中"} 天。
                </div>
              )}
              <div className="forecast-metrics">
                <span>
                  日均消费{" "}
                  <b>
                    {money.format((forecast?.averageDailySpend ?? 0) / 100)}
                  </b>
                </span>
                <span>
                  月均固定开销{" "}
                  <b>{money.format((forecast?.monthlyFixed ?? 0) / 100)}</b>
                </span>
                <span>
                  当前预测净资产{" "}
                  <b>{money.format((forecast?.netWorth ?? 0) / 100)}</b>
                </span>
              </div>
            </article>
            <article className="stress-lab">
              <div className="stress-head">
                <div>
                  <p className="eyebrow">BLACK SWAN LAB</p>
                  <h3>🌪️ 黑天鹅压力测试沙盘</h3>
                  <span>仅在前端内存演练，不修改任何真实账户与账单</span>
                </div>
                <div
                  className="resilience-gauge"
                  style={
                    {
                      "--score": `${resilienceScore * 3.6}deg`,
                    } as React.CSSProperties
                  }
                >
                  <div>
                    <strong>{resilienceScore}</strong>
                    <small>财务韧性</small>
                  </div>
                </div>
              </div>
              <div className="stress-events">
                <label className={stressEvents.unemployment ? "active" : ""}>
                  <input
                    type="checkbox"
                    checked={stressEvents.unemployment}
                    onChange={(event) =>
                      setStressEvents((value) => ({
                        ...value,
                        unemployment: event.target.checked,
                      }))
                    }
                  />
                  <span>🏢</span>
                  <div>
                    <strong>老板明天把公司解散了</strong>
                    <small>工资收入归零，测算无收入生存跑道</small>
                  </div>
                </label>
                <label className={stressEvents.crash ? "active" : ""}>
                  <input
                    type="checkbox"
                    checked={stressEvents.crash}
                    onChange={(event) =>
                      setStressEvents((value) => ({
                        ...value,
                        crash: event.target.checked,
                      }))
                    }
                  />
                  <span>📉</span>
                  <div>
                    <strong>理财资产腰斩</strong>
                    <small>投资账户瞬间蒸发 50%</small>
                  </div>
                </label>
                <label className={stressEvents.emergency ? "active" : ""}>
                  <input
                    type="checkbox"
                    checked={stressEvents.emergency}
                    onChange={(event) =>
                      setStressEvents((value) => ({
                        ...value,
                        emergency: event.target.checked,
                      }))
                    }
                  />
                  <span>🏥</span>
                  <div>
                    <strong>突发 ¥30,000 紧急支出</strong>
                    <small>检验现金类账户流动性是否断裂</small>
                  </div>
                </label>
              </div>
              <div className="stress-result">
                <div>
                  <span>F-Runway 生存跑道</span>
                  <strong>{stressRunway} 天</strong>
                </div>
                <div>
                  <span>压力后净资产</span>
                  <strong>{money.format(stressedNet / 100)}</strong>
                </div>
                <p>
                  {resilienceScore >= 80
                    ? "您的财务防波堤相当扎实，但仍建议保留 6—12 个月现金应急金。"
                    : resilienceScore >= 50
                      ? "韧性处于可守区间。优先补足现金储备，并降低固定订阅与高波动资产集中度。"
                      : "警报：一次意外就可能击穿现金流。先暂停非必要消费，建立至少 3 个月应急金。"}
                  {liquidAssets < 0
                    ? " 当前现金类账户无法独立覆盖 3 万元突发支出。"
                    : " 当前现金流动性可以覆盖本次突发测试。"}
                </p>
              </div>
            </article>
            <div className="health-grid">
              <article>
                <span>本期净结余</span>
                <strong
                  className={analysis.balance >= 0 ? "healthy" : "danger"}
                >
                  {money.format(analysis.balance / 100)}
                </strong>
              </article>
              <article>
                <span>储蓄率</span>
                <strong>{analysis.savingRate.toFixed(1)}%</strong>
              </article>
              <article>
                <span>财务健康度</span>
                <strong>
                  {analysis.savingRate >= 30
                    ? "优秀"
                    : analysis.savingRate >= 10
                      ? "稳健"
                      : analysis.balance >= 0
                        ? "待提升"
                        : "需关注"}
                </strong>
              </article>
            </div>
            <article className="side-hustle-dashboard">
              <div>
                <p className="eyebrow">SLASH CAREER P&L</p>
                <h3>💼 多源收益与综合税筹</h3>
                <span>本月副业经营视角 · 金额统一折算人民币</span>
              </div>
              <div className="side-profit-grid">
                <section>
                  <span>副业收入</span>
                  <strong>{money.format(sideIncomeCny / 100)}</strong>
                </section>
                <section>
                  <span>副业成本</span>
                  <strong>{money.format(sideCostCny / 100)}</strong>
                </section>
                <section>
                  <span>副业净利润</span>
                  <strong>{money.format(sideProfit / 100)}</strong>
                </section>
                <section className="tax-number">
                  <span>预计预扣税</span>
                  <strong>{money.format(estimatedTax / 100)}</strong>
                </section>
              </div>
              <p>
                当前副业收入预计需预扣税 {money.format(estimatedTax / 100)}
                ，税后并扣除已标记成本，预计真实落袋{" "}
                {money.format(
                  Math.max(0, sideIncomeCny - sideCostCny - estimatedTax) / 100,
                )}
                。成本标签用于经营利润管理，不代表当然可以在劳务报酬预扣环节税前扣除；最终以扣缴凭证和年度汇算为准。
              </p>
              <small>
                精简估算口径：单次/月度聚合模拟；≤¥4,000 减 ¥800，超过 ¥4,000 减
                20%费用，再按 20%/30%/40%预扣率及速算扣除数计算。
              </small>
            </article>
            <article className="insight-card">
              <span>✨ 模拟 AI 财务点评</span>
              <p>
                {analysis.incomeTotal || analysis.expenseTotal
                  ? `本期净结余 ${money.format(analysis.balance / 100)}，储蓄率 ${analysis.savingRate.toFixed(1)}%。您的理财收益已覆盖 ${analysis.needExpense ? ((analysis.investmentIncome / analysis.needExpense) * 100).toFixed(1) : "0.0"}% 的刚需支出；${analysis.savingRate >= 20 ? "现金流表现不错，继续保持长期主义。" : "建议给冲动消费设一道冷静期，把工资留在账户里久一点。"}`
                  : "当前时间范围内还没有资金流，专业分析正在等待真实数据。"}
              </p>
            </article>
          </section>
        )}
        </div>

        <button
          className="floating-entry-button"
          onClick={() => openDialog(entryRef, setEntryOpen)}
          aria-label="记一笔"
          title="记一笔"
        >
          <span>＋</span>
          <b>记一笔</b>
        </button>
      </section>

      {entryOpen && (
        <dialog
          className="expense-dialog entry-dialog"
          ref={entryRef}
          onCancel={() => closeDialog(entryRef, setEntryOpen)}
        >
          <form action={submitEntry} className="expense-form">
            <button
              type="button"
              className="close-button"
              onClick={() => closeDialog(entryRef, setEntryOpen)}
            >
              ×
            </button>
            <p className="eyebrow">SMART ENTRY</p>
            <h2>记一笔资金流</h2>
            <div className="type-switch">
              <button
                type="button"
                className={entryType === "支出" ? "active" : ""}
                onClick={() => setEntryType("支出")}
              >
                支出
              </button>
              <button
                type="button"
                className={entryType === "收入" ? "active" : ""}
                onClick={() => setEntryType("收入")}
              >
                收入
              </button>
            </div>
            <label className="amount-field">
              <span>
                {
                  currencySymbol[
                    accountList.find((item) => item.id === accountId)
                      ?.currency ?? "CNY"
                  ]
                }
              </span>
              <input
                key={parsedAmount}
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={parsedAmount}
                placeholder="0.00"
                required
              />
            </label>
            <div className="two-fields">
              <label className="title-field">
                <span>{entryType === "支出" ? "账单名称" : "收入备注"}</span>
                <input
                  key={parsedTitle}
                  name="title"
                  defaultValue={parsedTitle}
                  placeholder={
                    entryType === "支出" ? "如：午餐外卖" : "如：七月工资"
                  }
                  required
                />
              </label>
              <label className="title-field">
                <span>发生时间</span>
                <input name="occurredAt" type="datetime-local" />
              </label>
            </div>
            <fieldset>
              <legend>{entryType === "支出" ? "扣款账户" : "入账账户"}</legend>
              <div className="account-select-grid">
                {accountList.map((item) => (
                  <button
                    type="button"
                    className={accountId === item.id ? "selected" : ""}
                    onClick={() => setAccountId(item.id)}
                    key={item.id}
                  >
                    <span>{item.icon}</span>
                    <small>{item.name}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            {entryType === "支出" && memberList.some((item) => !item.isMe) && (
              <fieldset className="split-field">
                <legend>👥 分账模式</legend>
                <div className="split-member-row">
                  <select
                    value={splitMemberId}
                    onChange={(event) =>
                      setSplitMemberId(Number(event.target.value))
                    }
                  >
                    {memberList
                      .filter((item) => !item.isMe)
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.icon} 与 {item.name} 分账
                        </option>
                      ))}
                  </select>
                  <button type="button" onClick={addMember}>
                    ＋ 搭子
                  </button>
                </div>
                <div className="split-mode-grid">
                  {(
                    ["全额由我支付", "全额由对方支付", "按比例平摊"] as const
                  ).map((item) => (
                    <button
                      type="button"
                      className={splitMode === item ? "selected" : ""}
                      onClick={() => setSplitMode(item)}
                      key={item}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                {splitMode === "按比例平摊" && (
                  <label className="ratio-slider">
                    <span>
                      我的承担比例 <b>{mySharePercent}%</b> · 对方{" "}
                      {100 - mySharePercent}%
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={mySharePercent}
                      onChange={(event) =>
                        setMySharePercent(Number(event.target.value))
                      }
                    />
                  </label>
                )}
              </fieldset>
            )}
            {entryType === "支出" ? (
              <>
                <fieldset>
                  <legend className="category-legend">
                    <span>消费分类</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(null);
                        setCategoryError("");
                        openDialog(categoryManagerRef, setCategoryManagerOpen);
                      }}
                    >
                      ⚙ 管理分类
                    </button>
                  </legend>
                  <div className="category-options">
                    {categories.map((item) => (
                      <button
                        type="button"
                        className={`category-option ${category === item ? "selected" : ""}`}
                        onClick={() => setCategory(item)}
                        key={item}
                      >
                        <span>{categoryMeta[item].emoji}</span>
                        <strong>{item}</strong>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>消费情绪</legend>
                  <div className="mood-options">
                    {moods.map((item) => (
                      <button
                        type="button"
                        className={`mood-option compact ${mood === item ? "selected" : ""}`}
                        onClick={() => setMood(item)}
                        key={item}
                      >
                        <span>{moodMeta[item].emoji}</span>
                        <strong>{item}</strong>
                        <small>{moodMeta[item].label}</small>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="business-tag separated-business-tag">
                  <input type="checkbox" name="isBusinessExpense" />
                  <span>💼 标记为副业成本</span>
                  <small>设备、客户餐叙、店铺经营等可归入副业利润核算</small>
                </label>
                <fieldset className="import-box">
                  <legend>截图 / 文本导入 · 模拟 AI</legend>
                  <input
                    className="quick-entry-input"
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                    placeholder="一句话记账：发工资8000入账微信钱包"
                  />
                  <textarea
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                    placeholder="粘贴外卖订单，例如：美团外卖 麦当劳 实付：36.50元"
                  />
                  <label
                    className={`ocr-sandbox `}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      scanReceipt(event.dataTransfer.files[0]);
                    }}
                  >
                    {receiptUrl ? (
                      <div className="receipt-stage">
                        {/* Local blob previews cannot use the Next image optimizer. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={receiptUrl} alt="待识别收据" />
                        {scanning && <i className="scan-line" />}
                        {!scanning && (
                          <>
                            <span className="ocr-box merchant">
                              商户 · 麦当劳
                            </span>
                            <span className="ocr-box amount">
                              金额 · ¥35.00
                            </span>
                          </>
                        )}
                      </div>
                    ) : (
                      <div>
                        <b>📸 智能扫描沙盒</b>
                        <span>拖拽收据图片到这里，或点击上传</span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => scanReceipt(event.target.files?.[0])}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={runParser}
                    disabled={!importText || pending}
                  >
                    智能拆解金额与分类
                  </button>
                  {parsedPreview && (
                    <div className="parse-preview">
                      <strong>✨ 已智能拆解</strong>
                      <span>
                        {parsedPreview.type} · ¥{parsedPreview.amount} ·{" "}
                        {parsedPreview.type === "支出"
                          ? parsedPreview.category
                          : parsedPreview.incomeCategory}
                      </span>
                      <span>
                        {parsedPreview.accountName} · {parsedPreview.mood}
                      </span>
                      <button type="button" onClick={confirmParsed}>
                        确认并一键入库
                      </button>
                    </div>
                  )}
                </fieldset>
              </>
            ) : (
              <fieldset className="income-category-field">
                <legend className="category-legend">
                  <span>收入分类</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingIncomeCategory(null);
                      setIncomeCategoryError("");
                      openDialog(incomeManagerRef, setIncomeManagerOpen);
                    }}
                  >
                    ⚙ 管理分类
                  </button>
                </legend>
                <div className="income-options">
                  {activeIncomeCategories.map((item) => (
                    <button
                      type="button"
                      className={incomeCategory === item ? "selected" : ""}
                      onClick={() => setIncomeCategory(item)}
                      key={item}
                    >
                      <span>{incomeMeta[item].emoji}</span>
                      <strong>{item}</strong>
                    </button>
                  ))}
                </div>
                {selectedIncomeCategory?.builtinKey === "理财收益" && (
                  <p className="investment-hint">
                    选择上方“招商银行理财卡/基金账户”，收益将累计计入模拟年化回报。
                  </p>
                )}
                <label className="business-tag separated-business-tag">
                  <input type="checkbox" name="isSideHustle" />
                  <span>⚡ 标记为副业经营收益</span>
                  <small>接单、自媒体、网店或搭子分成</small>
                </label>
              </fieldset>
            )}
            {nudgeActive && (
              <section className="nudge-friction">
                <div>
                  <span>🧠</span>
                  <div>
                    <strong>温和劝导 · 深度阻尼已启动</strong>
                    <p>
                      {threeDayImpulse
                        ? "你已经连续 3 天记录冲动消费。"
                        : "当前分类预算已使用超过 90%。"}{" "}
                      损失厌恶提醒：今天花掉的钱，也是在向未来的自己借自由。
                    </p>
                  </div>
                </div>
                <label>
                  <span>请手动输入以下反思句以解锁：</span>
                  <b>{reflectionPhrase}</b>
                  <input
                    value={reflection}
                    onChange={(event) => setReflection(event.target.value)}
                    placeholder="慢慢输入，给大脑 5 秒钟追上手速"
                  />
                </label>
              </section>
            )}
            <button
              className={`submit-button ${nudgeActive ? "damped" : ""}`}
              disabled={
                pending ||
                (nudgeActive && reflection.trim() !== reflectionPhrase)
              }
            >
              {pending ? "正在联动账户…" : `保存${entryType}并更新账户`}
            </button>
          </form>
        </dialog>
      )}

      {aestheticOpen && (
        <dialog
          className="expense-dialog aesthetic-dialog"
          ref={aestheticRef}
          onCancel={() => closeDialog(aestheticRef, setAestheticOpen)}
        >
          <div className="expense-form">
            <button
              type="button"
              className="close-button"
              onClick={() => closeDialog(aestheticRef, setAestheticOpen)}
            >
              ×
            </button>
            <p className="eyebrow">AESTHETIC LAB</p>
            <h2>🎨 美学实验室</h2>
            <p className="form-subtitle">
              选择你的财务人格，整站与图表同步换肤。
            </p>
            <div className="theme-grid">
              {(
                [
                  {
                    id: "cream",
                    icon: "🥛",
                    name: "治愈奶卡",
                    desc: "奶油米白 · 温柔松弛",
                  },
                  {
                    id: "obsidian",
                    icon: "⬛",
                    name: "曜石极客",
                    desc: "纯黑 · 荧光绿 · 霓虹紫",
                  },
                  {
                    id: "glacier",
                    icon: "🌊",
                    name: "冰川极简",
                    desc: "冷灰 · 冰蓝 · 理性清醒",
                  },
                  {
                    id: "peach",
                    icon: "🍑",
                    name: "蜜桃多巴胺",
                    desc: "粉橙 · 元气 · 快乐记账",
                  },
                ] as {
                  id: ThemeName;
                  icon: string;
                  name: string;
                  desc: string;
                }[]
              ).map((item) => (
                <button
                  className={theme === item.id ? "selected" : ""}
                  onClick={() => chooseTheme(item.id)}
                  key={item.id}
                >
                  <span>{item.icon}</span>
                  <strong>{item.name}</strong>
                  <small>{item.desc}</small>
                </button>
              ))}
            </div>
            <form action={configureLock} className="privacy-setting">
              <label>
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={securityEnabled}
                />
                <span>开启启动安全锁</span>
              </label>
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                pattern="\d{4}"
                placeholder="设置4位数字 PIN"
              />
              <button disabled={pending}>保存隐私设置</button>
            </form>
          </div>
        </dialog>
      )}

      {goalOpen && (
        <dialog
          className="expense-dialog account-dialog"
          ref={goalRef}
          onCancel={() => closeDialog(goalRef, setGoalOpen)}
        >
          <form
            action={savingGoal ? contributeGoal : submitGoal}
            className="expense-form"
          >
            <button
              type="button"
              className="close-button"
              onClick={() => closeDialog(goalRef, setGoalOpen)}
            >
              ×
            </button>
            <p className="eyebrow">DREAM VAULT</p>
            <h2>
              {savingGoal
                ? savingGoal.savedAmount >= savingGoal.targetAmount
                  ? `管理「${savingGoal.name}」`
                  : `给「${savingGoal.name}」存一笔`
                : "创建存钱心愿"}
            </h2>
            {savingGoal ? (
              <>
                <label className="title-field">
                  <span>
                    {savingGoal.savedAmount > 0
                      ? "划转账户 / 删除时退款账户"
                      : "从哪个资产账户划转"}
                  </span>
                  <select name="accountId" required>
                    {accountList
                      .filter((item) => item.type === "资产")
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name} ·{" "}
                          {money.format(item.currentBalance / 100)}
                        </option>
                      ))}
                  </select>
                </label>
                {savingGoal.savedAmount >= savingGoal.targetAmount ? (
                  <p className="goal-complete-note">
                    这个心愿已经存满。删除时，已存金额会完整退回上方账户。
                  </p>
                ) : (
                  <label className="title-field">
                    <span>
                      存入金额 · 还差{" "}
                      {money.format(
                        (savingGoal.targetAmount - savingGoal.savedAmount) / 100,
                      )}
                    </span>
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      max={(
                        (savingGoal.targetAmount - savingGoal.savedAmount) /
                        100
                      ).toFixed(2)}
                      step="0.01"
                      required
                    />
                  </label>
                )}
              </>
            ) : (
              <>
                <div className="two-fields">
                  <label className="title-field">
                    <span>心愿图标</span>
                    <input name="icon" defaultValue="🎮" maxLength={4} />
                  </label>
                  <label className="title-field">
                    <span>心愿名称</span>
                    <input name="name" placeholder="去日本旅行" required />
                  </label>
                </div>
                <div className="two-fields">
                  <label className="title-field">
                    <span>目标金额</span>
                    <input
                      name="targetAmount"
                      type="number"
                      min="1"
                      step="1"
                      required
                    />
                  </label>
                  <label className="title-field">
                    <span>截止日期</span>
                    <input name="deadline" type="date" required />
                  </label>
                </div>
              </>
            )}
            {goalError && <p className="account-error">{goalError}</p>}
            {savingGoal &&
              !accountList.some((item) => item.type === "资产") && (
                <p className="account-error">请先创建一个资产账户。</p>
              )}
            <div className="goal-dialog-actions">
              {(!savingGoal ||
                savingGoal.savedAmount < savingGoal.targetAmount) && (
                <button
                  className="submit-button"
                  disabled={
                    pending ||
                    (Boolean(savingGoal) &&
                      !accountList.some((item) => item.type === "资产"))
                  }
                >
                  {savingGoal ? "确认划转" : "装进心愿罐"}
                </button>
              )}
              {savingGoal && (
                <button
                  type="submit"
                  className="danger-button"
                  formAction={deleteGoal}
                  disabled={
                    pending ||
                    (savingGoal.savedAmount > 0 &&
                      !accountList.some((item) => item.type === "资产"))
                  }
                >
                  {savingGoal.savedAmount > 0 ? "删除并退款" : "删除心愿"}
                </button>
              )}
            </div>
          </form>
        </dialog>
      )}

      {subscriptionOpen && (
        <dialog
          className="expense-dialog account-dialog subscription-dialog"
          ref={subscriptionRef}
          onCancel={() => closeDialog(subscriptionRef, setSubscriptionOpen)}
        >
          <form
            action={submitSubscription}
            className="expense-form"
            key={editingSubscription?.id ?? "new"}
          >
            <button
              type="button"
              className="close-button"
              onClick={() => closeDialog(subscriptionRef, setSubscriptionOpen)}
            >
              ×
            </button>
            <p className="eyebrow">AUTOMATIC PAYMENT</p>
            <h2>
              {editingSubscription
                ? `修改「${editingSubscription.name}」`
                : "新增续费 / 固定开销"}
            </h2>
            <label className="title-field">
              <span>订阅名称</span>
              <input
                name="name"
                placeholder="如：房租、iCloud、B站大会员"
                defaultValue={editingSubscription?.name ?? ""}
                required
              />
            </label>
            <div className="two-fields">
              <label className="title-field">
                <span>扣款金额</span>
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={
                    editingSubscription
                      ? (editingSubscription.amount / 100).toFixed(2)
                      : ""
                  }
                  required
                />
              </label>
              <label className="title-field">
                <span>会员到期 / 下次续费日期</span>
                <input
                  name="nextChargeDate"
                  type="date"
                  defaultValue={editingSubscription?.nextChargeDate ?? ""}
                  required
                />
              </label>
            </div>
            <div className="two-fields">
              <label className="title-field">
                <span>周期</span>
                <select
                  name="cycle"
                  defaultValue={editingSubscription?.cycle ?? "每月"}
                >
                  <option>每月</option>
                  <option>每季</option>
                  <option>每年</option>
                </select>
              </label>
              <div className="title-field subscription-category-field">
                <div className="subscription-category-heading">
                  <span>分类</span>
                  <button
                    type="button"
                    aria-expanded={subscriptionCategoryOpen}
                    onClick={() =>
                      setSubscriptionCategoryOpen((current) => !current)
                    }
                  >
                    {subscriptionCategoryOpen ? "完成" : "管理分类"}
                  </button>
                </div>
                <select
                  name="category"
                  value={subscriptionCategory}
                  onChange={(event) =>
                    setSubscriptionCategory(event.target.value)
                  }
                >
                  {editingSubscription &&
                    !categories.includes(editingSubscription.category) && (
                      <option value={editingSubscription.category} disabled>
                        {editingSubscription.category}（已停用）
                      </option>
                    )}
                  {categories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>
            {subscriptionCategoryOpen && (
              <section className="subscription-category-manager">
                <div className="subscription-category-list">
                  {categoryList
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <div key={item.id}>
                        <span style={{ background: item.color }}>
                          {item.icon}
                        </span>
                        <strong>{item.name}</strong>
                        <button
                          type="button"
                          aria-label={`删除分类${item.name}`}
                          title="删除分类"
                          onClick={() => removeSubscriptionCategory(item)}
                          disabled={pending}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                </div>
                <div className="subscription-category-add">
                  <input
                    aria-label="新分类图标"
                    value={subscriptionCategoryDraft.icon}
                    onChange={(event) =>
                      setSubscriptionCategoryDraft((current) => ({
                        ...current,
                        icon: event.target.value.slice(0, 8),
                      }))
                    }
                    maxLength={8}
                  />
                  <input
                    aria-label="新分类名称"
                    value={subscriptionCategoryDraft.name}
                    onChange={(event) =>
                      setSubscriptionCategoryDraft((current) => ({
                        ...current,
                        name: event.target.value.slice(0, 12),
                      }))
                    }
                    placeholder="新分类名称"
                    maxLength={12}
                  />
                  <input
                    aria-label="新分类颜色"
                    type="color"
                    value={subscriptionCategoryDraft.color}
                    onChange={(event) =>
                      setSubscriptionCategoryDraft((current) => ({
                        ...current,
                        color: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    onClick={addSubscriptionCategory}
                    disabled={pending}
                  >
                    添加
                  </button>
                </div>
                {subscriptionCategoryError && (
                  <p className="account-error">{subscriptionCategoryError}</p>
                )}
              </section>
            )}
            <label className="title-field">
              <span>扣款资产账户</span>
              <select
                name="accountId"
                defaultValue={
                  editingSubscription?.accountId ??
                  accountList.find((item) => item.type === "资产")?.id
                }
                required
              >
                {accountList
                  .filter((item) => item.type === "资产")
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            {subscriptionError && (
              <p className="account-error">{subscriptionError}</p>
            )}
            {!accountList.some((item) => item.type === "资产") && (
              <p className="account-error">请先创建一个资产账户。</p>
            )}
            <button
              className="submit-button"
              disabled={
                pending || !accountList.some((item) => item.type === "资产")
              }
            >
              {editingSubscription ? "保存修改" : "保存自动扣款"}
            </button>
          </form>
        </dialog>
      )}

      {ledgerMenuOpen && (
        <dialog
          className="expense-dialog ledger-menu-dialog"
          ref={ledgerMenuRef}
          onCancel={() => closeDialog(ledgerMenuRef, setLedgerMenuOpen)}
        >
          <div className="expense-form">
            <button
              type="button"
              className="close-button"
              onClick={() => closeDialog(ledgerMenuRef, setLedgerMenuOpen)}
            >
              ×
            </button>
            <p className="eyebrow">LEDGER SPACE</p>
            <h2>📚 切换账本</h2>
            <label className="title-field ledger-choice">
              <span>当前账本</span>
              <select
                value={currentLedgerId}
                onChange={(event) => {
                  window.location.href = `/?ledger=${event.target.value}`;
                }}
              >
                {ledgers.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.icon} {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="ledger-menu-actions">
              <button onClick={createLedger}>＋ 新建账本</button>
              <button
                className="danger"
                onClick={deleteLedger}
                disabled={pending || ledgers.length <= 1}
              >
                − 删除当前账本
              </button>
            </div>
            {ledgers.length <= 1 && <small>至少需要保留一个账本。</small>}
          </div>
        </dialog>
      )}

      {noticeOpen && (
        <dialog
          className="expense-dialog notice-dialog"
          ref={noticeRef}
          onCancel={() => closeDialog(noticeRef, setNoticeOpen)}
        >
          <div className="expense-form">
            <button
              type="button"
              className="close-button"
              onClick={() => closeDialog(noticeRef, setNoticeOpen)}
            >
              ×
            </button>
            <p className="eyebrow">SYSTEM INBOX</p>
            <h2>🔔 系统通知</h2>
            <p className="form-subtitle">自动流水提醒与待确认任务集中在这里。</p>
            <section className="notice-center">
              <div>
                <strong>最新通知</strong>
                <span>{systemNotices.length} 条</span>
              </div>
              {systemNotices.length ? (
                systemNotices.slice(0, 10).map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.createdAt}</small>
                    </div>
                    <p>{item.message}</p>
                  </article>
                ))
              ) : (
                <p className="pipeline-empty">目前没有新的系统通知。</p>
              )}
            </section>
            <section className="automation-pipeline">
              <div>
                <p className="eyebrow">BARK / SMS AUTOMATION</p>
                <h3>📲 自动化流水线</h3>
                <span>POST /api/v1/webhook/auto-parse · Bearer SYNC_TOKEN</span>
              </div>
              <pre>{`POST /api/v1/webhook/auto-parse\nAuthorization: Bearer $SYNC_TOKEN\nContent-Type: application/json\n\n{"text":"【招商银行】您账户0422于07/11 22:15消费支出人民币15.00元。","ledgerId":${currentLedgerId}}`}</pre>
              <div className="pending-shuffle">
                <div>
                  <strong>待确认流水洗牌区</strong>
                  <span>
                    {pendingFlows.length} 笔等待补全分类{" "}
                    <button
                      className="refresh-pending"
                      onClick={() => void reloadPendingFlows()}
                    >
                      ↻ 刷新
                    </button>
                  </span>
                </div>
                {pendingFlows.length ? (
                  pendingFlows.map((item) => (
                    <article key={item.id}>
                      <span>⚡</span>
                      <div>
                        <strong>{item.title}</strong>
                        <small>
                          {item.accountName} · {item.occurredAt.slice(0, 16)} ·{" "}
                          {formatCurrency(item.amount / 100, item.currency)}
                        </small>
                        <p>{item.rawText}</p>
                      </div>
                      <select
                        defaultValue=""
                        onChange={(event) => {
                          if (event.target.value)
                            processPending(
                              item.id,
                              event.target.value as Category,
                            );
                        }}
                      >
                        <option value="" disabled>
                          一键补全分类
                        </option>
                        {categories.map((name) => (
                          <option value={name} key={name}>
                            {categoryMeta[name].emoji} {name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() =>
                          processPending(item.id, undefined, "ignore")
                        }
                      >
                        忽略并回滚
                      </button>
                    </article>
                  ))
                ) : (
                  <p className="pipeline-empty">
                    自动化雷达暂时安静。收到 Bark / 短信转发后，流水会在这里等待你轻点归类。
                  </p>
                )}
              </div>
            </section>
          </div>
        </dialog>
      )}

      {dataOpen && (
        <dialog
          className="expense-dialog data-dialog"
          ref={dataRef}
          onCancel={() => closeDialog(dataRef, setDataOpen)}
        >
          <div className="expense-form">
            <button
              type="button"
              className="close-button"
              onClick={() => closeDialog(dataRef, setDataOpen)}
            >
              ×
            </button>
            <p className="eyebrow">DATA VAULT</p>
            <h2>💾 数据中心</h2>
            <p className="form-subtitle">
              你的账本属于你。随时导出、备份和迁移。
            </p>
            <div className="data-actions">
              <a href="/api/data/export?format=csv">
                📊 导出为 Excel (CSV)<small>历史收支、分类与账户流水</small>
              </a>
              <a href="/api/data/export?format=json">
                🔒 备份全量数据 (JSON)<small>账户、账单、预算与自动扣款</small>
              </a>
              <label>
                📂 恢复 JSON 备份<small>将覆盖当前数据库，请谨慎操作</small>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => restoreBackup(event.target.files?.[0])}
                />
              </label>
            </div>
            <section className="app-update-band">
              <div>
                <p className="eyebrow">SIGNED GITHUB RELEASES</p>
                <h3>⬆️ 程序版本更新</h3>
                <p>
                  更新前自动备份本地数据库；新版启动或迁移失败时自动恢复原版本。
                </p>
              </div>
              <div className="app-update-status">
                <span>
                  当前版本 <b>v{updateInfo?.currentVersion ?? "…"}</b>
                </span>
                <span>
                  GitHub 最新 <b>v{updateInfo?.latestVersion ?? "…"}</b>
                </span>
                <strong>
                  {updateApplying
                    ? "正在备份、下载并验证更新…"
                    : updateChecking
                      ? "正在检查 GitHub Release…"
                      : updateInfo?.available
                        ? "发现新版本"
                        : updateInfo
                          ? "当前已是最新版"
                          : "等待检查"}
                </strong>
              </div>
              <div className="app-update-actions">
                <button
                  type="button"
                  onClick={() => void checkAppUpdate()}
                  disabled={updateChecking || updateApplying}
                >
                  ↻ 检查更新
                </button>
                <button
                  type="button"
                  className="primary-update"
                  onClick={applyAppUpdate}
                  disabled={
                    !updateInfo?.available ||
                    !updateInfo.canApply ||
                    updateChecking ||
                    updateApplying
                  }
                >
                  ⬆ 立即升级
                </button>
                {updateInfo?.releaseUrl && (
                  <a href={updateInfo.releaseUrl} target="_blank" rel="noreferrer">
                    GitHub 发布说明 ↗
                  </a>
                )}
              </div>
              {updateInfo?.available && !updateInfo.canApply && (
                <small>网页部署版只提示版本；一键升级需在本机启动器中运行。</small>
              )}
              {updateError && <p className="app-update-error">{updateError}</p>}
            </section>
            <section className="email-bill-sandbox">
              <div>
                <p className="eyebrow">STATEMENT DISTILLER</p>
                <h3>📥 全平台账单导入</h3>
                <span>微信、支付宝、美团、京东与银行卡流水自动识别</span>
                <button
                  className="clean-import-button"
                  onClick={cleanBadBillImports}
                  disabled={pending}
                >
                  🧹 清理误识别声明账单
                </button>
              </div>
              <label
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  parseBillFiles(event.dataTransfer.files);
                }}
              >
                <strong>
                  {pending
                    ? billImportStatus || "正在识别平台、字段与重复流水…"
                    : "拖拽账单或多张截图到这里"}
                </strong>
                <small>
                  支持 Excel / WPS / CSV / PDF / 图片 / HTML / TXT，可一次选择多张截图
                </small>
                <input
                  type="file"
                  multiple
                  accept=".xls,.xlsx,.xlsm,.xlsb,.ods,.et,.ett,.csv,.pdf,.jpg,.jpeg,.png,.webp,.bmp,.gif,.html,.htm,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet,application/pdf,image/jpeg,image/png,image/webp,image/bmp,image/gif,text/html,text/csv,text/plain"
                  onChange={(event) => parseBillFiles(event.target.files)}
                />
              </label>
              {billImportError && (
                <p className="import-error">{billImportError}</p>
              )}
              {billImportItems.length > 0 && (
                <div className="bill-preview">
                  <div>
                    <div>
                      <strong>
                        {billImportSummary?.sourceName ?? "账单"} · 待导入{" "}
                        {billImportItems.length} 笔
                      </strong>
                      {billImportSummary && (
                        <small>
                          共识别 {billImportSummary.detected} 笔
                          {billImportSummary.duplicates > 0 &&
                            ` · 已排除 ${billImportSummary.duplicates} 笔重复`}
                          {billImportSummary.skipped > 0 &&
                            ` · 已过滤 ${billImportSummary.skipped} 笔中性/无效交易`}
                        </small>
                      )}
                    </div>
                    <button
                      onClick={confirmBillImport}
                      disabled={
                        pending ||
                        billImportItems.some((item) => item.accountId <= 0)
                      }
                    >
                      确认并批量入库
                    </button>
                  </div>
                  {billImportSummary && (
                    <div className="import-reconciliation">
                      <div className="import-reconciliation-head">
                        <b>导入对账</b>
                        <span>源文件总行数 {billImportSummary.totalRows}</span>
                        <span>成功识别 {billImportSummary.ready}</span>
                        <span>规则过滤 {billImportSummary.filtered}</span>
                        <span>无法确认 {billImportSummary.unconfirmed}</span>
                        <span>截断 {billImportSummary.truncated}</span>
                      </div>
                      {billImportSummary.files.map((row) => (
                        <div key={row.fileName}>
                          <strong>{row.fileName}</strong>
                          <span>总行 {row.totalRows}</span>
                          <span>成功 {row.success}</span>
                          <span>过滤 {row.filtered}</span>
                          <span>待确认 {row.unconfirmed}</span>
                          <span>截断 {row.truncated}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="bill-account-mapping">
                    <p>支付方式映射</p>
                    {[...new Set(
                      billImportItems.map((item) => item.paymentMethod),
                    )].map((paymentMethod) => {
                      const current = billImportItems.find(
                        (item) => item.paymentMethod === paymentMethod,
                      );
                      return (
                        <label key={paymentMethod}>
                          <span>{paymentMethod}</span>
                          <select
                            value={current?.accountId ?? 0}
                            onChange={(event) =>
                              assignBillAccount(
                                paymentMethod,
                                Number(event.target.value),
                              )
                            }
                          >
                            <option value={0}>请选择账户</option>
                            {accountList.map((account) => (
                              <option value={account.id} key={account.id}>
                                {account.name} · {account.type}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                  {billImportSummary?.possibleDuplicates ? (
                    <p className="import-warning">
                      有 {billImportSummary.possibleDuplicates} 笔与现有流水的金额和时间接近，已标记供你复核。
                    </p>
                  ) : null}
                  <div className="bill-card-flow">
                    {billImportItems.map((item, index) => (
                      <article
                        className={item.possibleDuplicate ? "possible-duplicate" : ""}
                        key={item.importKey || `${item.occurredAt}-${index}`}
                      >
                        <span>{item.type === "支出" ? "↗" : "↙"}</span>
                        <div>
                          <strong>{item.merchant}</strong>
                          <small>
                            {item.occurredAt.slice(0, 16)} · {item.paymentMethod}{" "}
                            → {item.accountName} · {item.category}
                          </small>
                          {item.possibleDuplicate && <em>可能与已有流水重复</em>}
                        </div>
                        <b>
                          {item.type === "支出" ? "-" : "+"}
                          {formatCurrency(item.amount, item.currency)}
                        </b>
                        <button
                          aria-label="移除此条"
                          onClick={() =>
                            setBillImportItems((rows) =>
                              rows.filter((_, i) => i !== index),
                            )
                          }
                        >
                          ×
                        </button>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </section>
            <section className="p2p-star-cluster">
              <div className="p2p-radar">
                <i />
                <i />
                <i />
                <span>📱</span>
                <span>💻</span>
                <b>NAS</b>
              </div>
              <div>
                <p className="eyebrow">ZERO-TRUST LAN MESH</p>
                <h3>🌐 局域网 P2P 节点同步星群</h3>
                <p>
                  WebRTC DataChannel 直连传输，账单使用唯一 CRDT ID
                  与删除墓碑自动合并；信令只在本地服务暂存 10 分钟。
                </p>
                <div className="node-id">
                  <span>本机节点</span>
                  <code>{p2pNode || "正在生成…"}</code>
                </div>
                <div className="p2p-controls">
                  <label>
                    房间码
                    <input
                      value={p2pRoom}
                      onChange={(event) => setP2pRoom(event.target.value)}
                      placeholder="neo-home"
                    />
                  </label>
                  <label>
                    对端节点 ID
                    <input
                      value={p2pTarget}
                      onChange={(event) => setP2pTarget(event.target.value)}
                      placeholder="node-a1b2c3d4"
                    />
                  </label>
                  <button onClick={() => void hostPeer()}>
                    发起握手并同步
                  </button>
                </div>
                <small>{p2pStatus}</small>
                <details>
                  <summary>Bonjour / NAS 发现协议</summary>
                  <code>_neo-ledger._tcp.local · GET /api/p2p/discovery</code>
                  <p>
                    浏览器受安全沙箱限制不能直接广播
                    mDNS；极空间原生伴侣进程可注册该服务，PWA
                    继续使用本地信令完成 WebRTC 握手。
                  </p>
                </details>
              </div>
            </section>
            <section className="webdav-tower">
              <div className="orbit-visual">
                <div className="planet">🔐</div>
                <i />
                <i />
                <span>🛰️</span>
              </div>
              <div className="webdav-content">
                <p className="eyebrow">E2EE SOVEREIGN SYNC</p>
                <h3>多端云同步控制塔</h3>
                <p>
                  AES-256-GCM 在浏览器本地加密，密钥不上传、不保存。服务端与
                  WebDAV 只能看到密文。
                </p>
                <form action={syncWebDav}>
                  <label>
                    <span>WebDAV 地址</span>
                    <input
                      name="url"
                      type="url"
                      defaultValue={webdavConfig.url}
                      placeholder="https://dav.jianguoyun.com/dav/NeoLedger"
                      required
                    />
                  </label>
                  <div>
                    <label>
                      <span>用户名</span>
                      <input
                        name="username"
                        defaultValue={webdavConfig.username}
                      />
                    </label>
                    <label>
                      <span>应用密码</span>
                      <input
                        name="password"
                        type="password"
                        autoComplete="new-password"
                      />
                    </label>
                  </div>
                  <label>
                    <span>本地同步密钥</span>
                    <input
                      name="secret"
                      type="password"
                      minLength={8}
                      placeholder="至少 8 位；遗失后云端密文无法恢复"
                      required
                    />
                  </label>
                  <div className="sync-actions">
                    <button name="mode" value="upload" disabled={syncing}>
                      加密上传
                    </button>
                    <button name="mode" value="download" disabled={syncing}>
                      解密下载
                    </button>
                    <button name="mode" value="merge" disabled={syncing}>
                      双向冲突合并
                    </button>
                  </div>
                </form>
                <small>
                  {syncing ? "卫星正在交换密文…" : `上次同步：${syncStatus}`}
                </small>
              </div>
            </section>
            <article className="geek-channel">
              <div>
                <span>🌐</span>
                <div>
                  <p className="eyebrow">AUTOMATION BRIDGE</p>
                  <h3>极客通道 · Quick Sync API</h3>
                </div>
              </div>
              <p>
                密钥由服务器环境变量 <code>SYNC_TOKEN</code>{" "}
                保管，页面只显示掩码 <b>••••••••••••</b>
                ，不会把真实密钥泄露给浏览器。
              </p>
              <pre>{`POST /api/external/quick-sync\nAuthorization: Bearer $SYNC_TOKEN\nContent-Type: application/json\n\n{\n  "amount": 35.5,\n  "merchant": "麦当劳",\n  "time": "2026-07-11T12:30:00+08:00",\n  "ledgerId": ${currentLedgerId},\n  "category": "餐饮"\n}`}</pre>
              <small>
                也支持请求头 x-sync-token。amount 单位为元；accountId、category
                可选，服务端会自动匹配默认资产账户与消费分类。
              </small>
            </article>
          </div>
        </dialog>
      )}

      {transferOpen && (
        <dialog
          className="expense-dialog account-dialog"
          ref={transferRef}
          onCancel={() => closeDialog(transferRef, setTransferOpen)}
        >
          <form action={submitTransfer} className="expense-form">
            <button
              type="button"
              className="close-button"
              onClick={() => closeDialog(transferRef, setTransferOpen)}
            >
              ×
            </button>
            <p className="eyebrow">ACCOUNT TRANSFER</p>
            <h2>账户转账 / 信用卡还款</h2>
            <p className="form-subtitle">转入负债账户时会同时扣减资产并冲减欠款。</p>
            <label className="title-field">
              <span>转出资产账户</span>
              <select name="fromAccountId" required>
                {accountList.filter((item) => item.type === "资产").map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.icon} {item.name} · {formatCurrency(item.currentBalance / 100, item.currency)}
                  </option>
                ))}
              </select>
            </label>
            <label className="title-field">
              <span>转入账户</span>
              <select name="toAccountId" required>
                {accountList.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.icon} {item.name} · {item.type} · {item.currency}
                  </option>
                ))}
              </select>
            </label>
            <label className="title-field">
              <span>金额</span>
              <input name="amount" type="number" min="0.01" step="0.01" required />
            </label>
            <label className="title-field">
              <span>备注</span>
              <input name="note" maxLength={120} placeholder="可选" />
            </label>
            {accountError && <p className="account-error">{accountError}</p>}
            <button className="submit-button" disabled={pending}>确认转账</button>
          </form>
        </dialog>
      )}

      {accountOpen && (
        <dialog
          className="expense-dialog account-dialog"
          ref={accountRef}
          onCancel={() => closeDialog(accountRef, setAccountOpen)}
        >
          <form
            key={editingAccount?.id ?? "new"}
            action={submitAccount}
            className="expense-form"
          >
            <button
              type="button"
              className="close-button"
              onClick={() => closeDialog(accountRef, setAccountOpen)}
            >
              ×
            </button>
            <p className="eyebrow">ACCOUNT MANAGER</p>
            <h2>{editingAccount ? "编辑账户" : "新增账户"}</h2>
            <p className="form-subtitle">账户数据将实时保存到本地 SQLite。</p>
            <label className="title-field">
              <span>账户名称</span>
              <input
                name="name"
                defaultValue={editingAccount?.name ?? ""}
                placeholder="如：建设银行卡"
                maxLength={30}
                required
              />
            </label>
            <label className="title-field">
              <span>账户本币</span>
              <select
                name="currency"
                defaultValue={editingAccount?.currency ?? "CNY"}
              >
                <option value="CNY">🇨🇳 CNY · 人民币</option>
                <option value="USD">🇺🇸 USD · 美元</option>
                <option value="JPY">🇯🇵 JPY · 日元</option>
                <option value="EUR">🇪🇺 EUR · 欧元</option>
              </select>
            </label>
            {accountType === "资产" && (
              <label className="title-field">
                <span>资产属性</span>
                <select
                  name="assetClass"
                  defaultValue={
                    editingAccount?.assetClass ??
                    (editingAccount?.isInvestment ? "风险进攻" : "现金流")
                  }
                >
                  <option value="现金流">💧 现金流 · 微信/支付宝/活期</option>
                  <option value="固收防守">🛡️ 固收防守 · 存款/债券</option>
                  <option value="风险进攻">🚀 风险进攻 · 基金/股票/理财</option>
                </select>
              </label>
            )}
            <fieldset>
              <legend>账户类型</legend>
              <div className="account-type-switch">
                <button
                  type="button"
                  className={accountType === "资产" ? "active" : ""}
                  onClick={() => setAccountType("资产")}
                >
                  资产账户<small>现金 / 钱包 / 银行卡 / 理财</small>
                </button>
                <button
                  type="button"
                  className={accountType === "负债" ? "active" : ""}
                  onClick={() => setAccountType("负债")}
                >
                  负债账户<small>信用卡 / 花呗 / 白条</small>
                </button>
              </div>
            </fieldset>
            <label className="title-field">
              <span>
                {accountType === "负债" ? "当前欠款金额" : "当前账户余额"}
              </span>
              <input
                className="financial-input"
                name="balance"
                type="number"
                min="0"
                step="0.01"
                defaultValue={
                  editingAccount
                    ? (Math.abs(editingAccount.currentBalance) / 100).toFixed(2)
                    : "0.00"
                }
                required
              />
            </label>
            {accountType === "负债" ? (
              <div className="two-fields">
                <label className="title-field">
                  <span>每月账单日</span>
                  <input
                    name="billDay"
                    type="number"
                    min="1"
                    max="31"
                    defaultValue={editingAccount?.billDay ?? 1}
                    required
                  />
                </label>
                <label className="title-field">
                  <span>每月还款日</span>
                  <input
                    name="repaymentDay"
                    type="number"
                    min="1"
                    max="31"
                    defaultValue={editingAccount?.repaymentDay ?? 10}
                    required
                  />
                </label>
              </div>
            ) : (
              <label className="investment-check">
                <input
                  name="isInvestment"
                  type="checkbox"
                  defaultChecked={editingAccount?.isInvestment ?? false}
                />
                <span>这是投资理财账户，需要追踪收益率</span>
              </label>
            )}
            {accountError && <p className="account-error">{accountError}</p>}
            <div className="account-form-actions">
              {editingAccount && (
                <button
                  type="button"
                  className="danger-button"
                  onClick={removeAccount}
                  disabled={pending}
                >
                  删除 / 注销账户
                </button>
              )}
              <button className="submit-button" disabled={pending}>
                {pending ? "正在保存…" : "保存账户"}
              </button>
            </div>
          </form>
        </dialog>
      )}

      {incomeManagerOpen && (
        <dialog
          className="expense-dialog category-manager-dialog"
          ref={incomeManagerRef}
          onCancel={() => closeDialog(incomeManagerRef, setIncomeManagerOpen)}
        >
          <div className="expense-form">
            <button
              type="button"
              className="close-button"
              onClick={() => closeDialog(incomeManagerRef, setIncomeManagerOpen)}
            >
              ×
            </button>
            <p className="eyebrow">INCOME CATEGORY STUDIO</p>
            <h2>收入分类工作室</h2>
            <p className="form-subtitle">
              内置收入分类只支持重命名；自定义分类可自由添加和删减。
            </p>
            <div className="category-manager-list">
              {incomeCategoryList.map((item) => (
                <article className={item.isActive ? "" : "inactive"} key={item.id}>
                  <span style={{ background: item.color }}>{item.icon}</span>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.isSystem ? "系统内置 · 仅支持重命名" : "自定义收入分类"}
                      {!item.isActive ? " · 已停用" : ""}
                    </small>
                  </div>
                  {item.isActive ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingIncomeCategory(item)}
                      >
                        重命名
                      </button>
                      {!item.isSystem && (
                        <button
                          type="button"
                          className="category-remove"
                          onClick={() => removeIncomeCategory(item)}
                        >
                          移除
                        </button>
                      )}
                    </>
                  ) : (
                    <button type="button" onClick={() => restoreIncomeCategory(item)}>
                      恢复
                    </button>
                  )}
                </article>
              ))}
            </div>
            <form
              key={editingIncomeCategory?.id ?? "new-income-category"}
              action={saveIncomeCategory}
              className="category-editor"
            >
              <div>
                <p className="eyebrow">
                  {editingIncomeCategory ? "RENAME INCOME" : "NEW INCOME"}
                </p>
                <strong>
                  {editingIncomeCategory ? "编辑收入分类" : "添加收入分类"}
                </strong>
              </div>
              <label>
                <span>图标</span>
                <input
                  name="icon"
                  defaultValue={editingIncomeCategory?.icon ?? "💰"}
                  maxLength={8}
                  required
                />
              </label>
              <label>
                <span>名称</span>
                <input
                  name="name"
                  defaultValue={editingIncomeCategory?.name ?? ""}
                  placeholder="如：稿费"
                  maxLength={12}
                  required
                />
              </label>
              <label>
                <span>主题色</span>
                <input
                  name="color"
                  type="color"
                  defaultValue={editingIncomeCategory?.color ?? "#78a98c"}
                />
              </label>
              <button disabled={pending}>
                {editingIncomeCategory ? "保存修改" : "添加分类"}
              </button>
              {editingIncomeCategory && (
                <button
                  type="button"
                  className="cancel-category-edit"
                  onClick={() => setEditingIncomeCategory(null)}
                >
                  取消
                </button>
              )}
            </form>
            {incomeCategoryError && (
              <p className="account-error">{incomeCategoryError}</p>
            )}
          </div>
        </dialog>
      )}

      {categoryManagerOpen && (
        <dialog
          className="expense-dialog category-manager-dialog"
          ref={categoryManagerRef}
          onCancel={() =>
            closeDialog(categoryManagerRef, setCategoryManagerOpen)
          }
        >
          <div className="expense-form">
            <button
              type="button"
              className="close-button"
              onClick={() =>
                closeDialog(categoryManagerRef, setCategoryManagerOpen)
              }
            >
              ×
            </button>
            <p className="eyebrow">CATEGORY STUDIO</p>
            <h2>消费分类工作室</h2>
            <p className="form-subtitle">
              内置分类可以改名；移除采用安全停用，历史账单与统计不会丢失。
            </p>
            <div className="category-manager-list">
              {categoryList.map((item) => (
                <article className={item.isActive ? "" : "inactive"} key={item.id}>
                  <span style={{ background: item.color }}>{item.icon}</span>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.isSystem ? "系统内置 · 支持重命名" : "自定义分类"}
                      {!item.isActive ? " · 已停用" : ""}
                    </small>
                  </div>
                  {item.isActive ? (
                    <>
                      <button type="button" onClick={() => setEditingCategory(item)}>
                        重命名
                      </button>
                      <button
                        type="button"
                        className="category-remove"
                        onClick={() => disableExpenseCategory(item)}
                      >
                        移除
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => restoreExpenseCategory(item)}>
                      恢复
                    </button>
                  )}
                </article>
              ))}
            </div>
            <form
              key={editingCategory?.id ?? "new-category"}
              action={saveExpenseCategory}
              className="category-editor"
            >
              <div>
                <p className="eyebrow">
                  {editingCategory ? "RENAME CATEGORY" : "NEW CATEGORY"}
                </p>
                <strong>{editingCategory ? "编辑分类" : "添加新分类"}</strong>
              </div>
              <label>
                <span>图标</span>
                <input
                  name="icon"
                  defaultValue={editingCategory?.icon ?? "📦"}
                  maxLength={8}
                  required
                />
              </label>
              <label>
                <span>名称</span>
                <input
                  name="name"
                  defaultValue={editingCategory?.name ?? ""}
                  placeholder="如：宠物"
                  maxLength={12}
                  required
                />
              </label>
              <label>
                <span>主题色</span>
                <input
                  name="color"
                  type="color"
                  defaultValue={editingCategory?.color ?? "#8f91b8"}
                />
              </label>
              <button disabled={pending}>
                {editingCategory ? "保存修改" : "添加分类"}
              </button>
              {editingCategory && (
                <button
                  type="button"
                  className="cancel-category-edit"
                  onClick={() => setEditingCategory(null)}
                >
                  取消
                </button>
              )}
            </form>
            {categoryError && <p className="account-error">{categoryError}</p>}
          </div>
        </dialog>
      )}

      {assetOpen && (
        <dialog
          className="expense-dialog asset-dialog"
          ref={assetRef}
          onCancel={() => closeDialog(assetRef, setAssetOpen)}
        >
          <form action={submitDigitalAsset} className="expense-form">
            <button
              type="button"
              className="close-button"
              onClick={() => closeDialog(assetRef, setAssetOpen)}
            >
              ×
            </button>
            <p className="eyebrow">DEPRECIATION ONBOARDING</p>
            <h2>⌁ 添置新装备</h2>
            <p className="form-subtitle">
              系统将按当前日期实时推演残值，不会写入静态估价。
            </p>
            <label className="title-field">
              <span>资产名称</span>
              <input name="name" placeholder="如：iPhone 16 Pro" required />
            </label>
            <fieldset>
              <legend>资产类型</legend>
              <div className="asset-type-switch">
                {([
                  ["数码设备", "💻"],
                  ["游戏账号", "🎮"],
                  ["潮流玩具", "🏍️"],
                ] as const).map(([name, icon]) => (
                  <button
                    type="button"
                    className={assetType === name ? "active" : ""}
                    onClick={() => setAssetType(name)}
                    key={name}
                  >
                    <span>{icon}</span>
                    {name}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="two-fields">
              <label className="title-field">
                <span>购买价格（原值）</span>
                <input
                  name="purchasePrice"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="8999.00"
                  required
                />
              </label>
              <label className="title-field">
                <span>购买日期</span>
                <input
                  name="purchaseDate"
                  type="date"
                  max={todayKey || undefined}
                  defaultValue={todayKey}
                  required
                />
              </label>
            </div>
            <div className="two-fields">
              <label className="title-field">
                <span>预期寿命（月）</span>
                <input
                  name="lifespanMonths"
                  type="number"
                  min="1"
                  max="600"
                  defaultValue={assetType === "游戏账号" ? 24 : 36}
                  required
                />
              </label>
              <label className="title-field">
                <span>保底残值率（%）</span>
                <input
                  name="residualRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  defaultValue="10"
                  required
                />
              </label>
            </div>
            {assetType === "游戏账号" && (
              <label className="title-field heat-field">
                <span>市场热度</span>
                <select name="heatLevel" defaultValue="中">
                  <option value="高">🔥 高热度 · 衰减较慢</option>
                  <option value="中">🌤️ 中热度 · 标准衰减</option>
                  <option value="低">🧊 低热度 · 急速贬值</option>
                </select>
                <small>热度将作为指数项叠加到基础寿命折旧中。</small>
              </label>
            )}
            {assetError && <p className="account-error">{assetError}</p>}
            <button className="submit-button" disabled={pending}>
              {pending ? "正在测算初始残值…" : "放入资产货架"}
            </button>
          </form>
        </dialog>
      )}

      {liquidatingAsset && (
        <dialog
          className="expense-dialog asset-dialog"
          ref={liquidationRef}
          onCancel={() => {
            liquidationRef.current?.close();
            setLiquidatingAsset(null);
          }}
        >
          <form action={submitLiquidation} className="expense-form">
            <button
              type="button"
              className="close-button"
              onClick={() => {
                liquidationRef.current?.close();
                setLiquidatingAsset(null);
              }}
            >
              ×
            </button>
            <p className="eyebrow">LIQUIDATION DESK</p>
            <h2>🛒 变现 {liquidatingAsset.name}</h2>
            <div className="liquidation-quote">
              <span>系统当前估值</span>
              <strong>{money.format(liquidatingAsset.currentValue / 100)}</strong>
              <small>
                已较原值流失 {money.format(liquidatingAsset.valueLost / 100)}
              </small>
            </div>
            <label className="title-field">
              <span>二手实际卖出价</span>
              <input
                name="salePrice"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={(liquidatingAsset.currentValue / 100).toFixed(2)}
              />
            </label>
            <label className="title-field">
              <span>收入存入账户</span>
              <select name="accountId" defaultValue={accountList.find((item) => item.type === "资产")?.id}>
                {accountList
                  .filter((item) => item.type === "资产")
                  .map((account) => (
                    <option value={account.id} key={account.id}>
                      {account.icon} {account.name}
                    </option>
                  ))}
              </select>
            </label>
            {assetError && <p className="account-error">{assetError}</p>}
            <div className="liquidation-actions">
              <button
                name="mode"
                value="discard"
                className="discard-button"
                disabled={pending}
              >
                直接报废 · 不入账
              </button>
              <button
                name="mode"
                value="sell"
                className="submit-button"
                disabled={pending}
              >
                确认变现并入账
              </button>
            </div>
          </form>
        </dialog>
      )}

      {installmentOpen && (
        <dialog
          className="expense-dialog account-dialog"
          ref={installmentRef}
          onCancel={() => closeDialog(installmentRef, setInstallmentOpen)}
        >
          <form action={submitInstallment} className="expense-form">
            <button
              type="button"
              className="close-button"
              onClick={() => closeDialog(installmentRef, setInstallmentOpen)}
            >
              ×
            </button>
            <p className="eyebrow">AMORTIZATION ENGINE</p>
            <h2>新增大件分期</h2>
            <label className="title-field">
              <span>大件名称</span>
              <input name="name" placeholder="如：iPhone 16 Pro" required />
            </label>
            <div className="two-fields">
              <label className="title-field">
                <span>总金额</span>
                <input
                  name="totalAmount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </label>
              <label className="title-field">
                <span>手续费 / 利息</span>
                <input
                  name="feeAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                />
              </label>
            </div>
            <div className="two-fields">
              <label className="title-field">
                <span>总期数</span>
                <select name="periods" defaultValue="12">
                  <option value="3">3期</option>
                  <option value="6">6期</option>
                  <option value="12">12期</option>
                  <option value="24">24期</option>
                  <option value="36">36期</option>
                </select>
              </label>
              <label className="title-field">
                <span>每月扣款日</span>
                <input
                  name="chargeDay"
                  type="number"
                  min="1"
                  max="31"
                  defaultValue="1"
                  required
                />
              </label>
            </div>
            <label className="title-field">
              <span>开始月份</span>
              <input name="startMonth" type="month" required />
            </label>
            <label className="title-field">
              <span>分期负债账户</span>
              <select name="accountId">
                {accountList.filter((item) => item.type === "负债").map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.icon} {item.name} · {item.currency}
                  </option>
                ))}
              </select>
            </label>
            <label className="title-field">
              <span>每月还款账户</span>
              <select name="paymentAccountId">
                {accountList.filter((item) => item.type === "资产").map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.icon} {item.name} · {item.currency}
                  </option>
                ))}
              </select>
            </label>
            <button className="submit-button" disabled={pending}>
              启动自动摊销
            </button>
          </form>
        </dialog>
      )}

      {badgeOpen && (
        <dialog
          className="expense-dialog badge-dialog"
          ref={badgeRef}
          onCancel={() => closeDialog(badgeRef, setBadgeOpen)}
        >
          <div className="badge-wall">
            <div className="gold-particles">✦ · ✧ · ✦ · ✧</div>
            <button
              className="close-button"
              onClick={() => closeDialog(badgeRef, setBadgeOpen)}
            >
              ×
            </button>
            {focusedBadge ? (
              <>
                <p className="eyebrow">HIGHEST ACHIEVEMENT</p>
                <h2>今日最高成就</h2>
                <article
                  className={`badge-showcase tier-${badgeTierClass[focusedBadge.tier]}`}
                >
                  <em>{focusedBadge.tier}勋章</em>
                  <span>{focusedBadge.icon}</span>
                  <h3>{focusedBadge.name}</h3>
                  <p>{focusedBadge.desc}</p>
                  <b>已解锁 · 当前最高等级</b>
                </article>
                <button
                  className="submit-button"
                  onClick={() => setBadgeFocusCode(null)}
                >
                  查看完整勋章墙
                </button>
              </>
            ) : (
              <>
                <p className="eyebrow">ACHIEVEMENT COLLECTION</p>
                <h2>🎖️ 打工人自律勋章墙</h2>
                <p>
                  当前段位：<strong>{rank}</strong> · 已解锁 {achievements.length}
                  /{badgeDefinitions.length}
                </p>
                <div className="badge-tier-legend">
                  {(Object.keys(badgeTierRank) as BadgeTier[]).map((tier) => (
                    <span className={`tier-${badgeTierClass[tier]}`} key={tier}>
                      {tier}
                    </span>
                  ))}
                </div>
                <div className="badge-grid">
                  {badgeDefinitions.map((badge) => {
                    const unlocked = achievements.some(
                      (item) => item.code === badge.code,
                    );
                    const concealed = badge.tier === "隐藏" && !unlocked;
                    return (
                      <article
                        className={`${unlocked ? "unlocked" : "locked"} tier-${badgeTierClass[badge.tier]}`}
                        key={badge.code}
                      >
                        <em>{badge.tier}</em>
                        <span>{unlocked ? badge.icon : concealed ? "❓" : "🔒"}</span>
                        <h3>{concealed ? "隐藏成就" : badge.name}</h3>
                        <p>{concealed ? "条件未知，静待命运触发" : badge.desc}</p>
                        <b>{unlocked ? "已点亮" : "继续解锁"}</b>
                      </article>
                    );
                  })}
                </div>
                <button
                  className="submit-button"
                  onClick={() => closeDialog(badgeRef, setBadgeOpen)}
                >
                  收下这份精神氮泵
                </button>
              </>
            )}
          </div>
        </dialog>
      )}

      {budgetOpen && (
        <dialog
          className="expense-dialog budget-dialog"
          ref={budgetRef}
          onCancel={() => closeDialog(budgetRef, setBudgetOpen)}
        >
          <form
            action={(data) =>
              startTransition(async () => {
                await updateBudget(data);
                closeDialog(budgetRef, setBudgetOpen);
              })
            }
            className="expense-form"
          >
            <button
              type="button"
              className="close-button"
              onClick={() => closeDialog(budgetRef, setBudgetOpen)}
            >
              ×
            </button>
            <input type="hidden" name="ledgerId" value={currentLedgerId} />
            <p className="eyebrow">MONTHLY PLAN</p>
            <h2>修改本月预算</h2>
            <label className="amount-field budget-amount-field">
              <span>¥</span>
              <input
                name="budget"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={(budget / 100).toFixed(2)}
                required
              />
            </label>
            <button className="submit-button">保存预算</button>
          </form>
        </dialog>
      )}

    </main>
  );
}
