"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import Script from "next/script";
import {
  useCallback,
  useMemo,
  useRef,
  useTransition,
} from "react";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { MobileHeader } from "./mobile-header";
import { TabletRailNav } from "./tablet-rail-nav";
import { TabletContextPanel } from "./tablet-context-panel";
import { useAppKeyboardShortcuts } from "./app-keyboard-shortcuts";
import { useBillDataRevisionState } from "./bill-data-revision-state";
import {
  parseStatementFiles,
  type ParsedStatementItem,
} from "./bill-file-parser";
import {
  partitionStatementImports,
  statementAccountKey,
  suggestStatementAccount,
} from "./bill-import-core.js";
import {
  normalizeBillAnchor,
} from "./bill-period.js";
import {
  ASSET_PAGE_SIZE,
  BILL_PAGE_SIZE,
  COLLECTION_PAGE_SIZE,
  paginateBills,
} from "./bill-pagination.js";
import { createClientId } from "./client-id.js";
import { mergeSyncSnapshots } from "./sync-merge.js";
import { decryptSyncPayload, encryptSyncPayload } from "./sync-crypto.js";
import { ASSET_TYPE_OPTIONS } from "./asset-core.js";
import { splitBalanceDelta } from "./split-core.js";
import { AuthPanel, type ClientAuthUser } from "./auth-panel.tsx";
import { SubscriptionSection, type SubscriptionListItem } from "./subscription-section";
import { SavingsGoalSection, type SavingsGoalListItem } from "./savings-goal-section";
import { InstallmentSection } from "./installment-section";
import { CategoryBudgetSection } from "./category-budget-section";
import { SettlementSection } from "./settlement-section";
import { AccountDialogs } from "./account-dialogs";
import { TransactionEntryDialog } from "./transaction-entry-dialog";
import { AssetDialogs } from "./asset-dialogs";
import { CategoryDialogs } from "./category-dialogs";
import { BillSection, type BillSectionRow } from "./bill-section";
import { AccountSection } from "./account-section";
import { DigitalAssetSection } from "./digital-asset-section";
import { FinanceOverviewSection } from "./finance-overview-section";
import { AnalyticsSection } from "./analytics-section";
import { DataCenterDialog } from "./data-center-dialog";
import { NotificationDialog } from "./notification-dialog";
import { LedgerMenuDialog } from "./ledger-menu-dialog";
import { AestheticDialog } from "./aesthetic-dialog";
import { AchievementBadgeDialog } from "./achievement-badge-dialog";
import { OnboardingCard } from "./onboarding-card";
import { BudgetDialog } from "./budget-dialog";
import { InstallmentDialog } from "./installment-dialog";
import { useOnboardingState } from "./onboarding-state";
import {
  badgeDefinitions,
  badgeTierRank,
} from "./achievement-badge-data";
import { TransactionEditDialog } from "./transaction-edit-dialog";
import {
  assertOfflineEntryWithinBudget,
  MAX_OFFLINE_QUEUE_ENTRIES,
  offlineQueueHasCapacity,
} from "./offline-queue";
import { usePrivacyLock } from "./privacy-lock";
import { localDateKey as toLocalDateKey, useLedgerClock } from "./ledger-clock";
import { useReconciliationState } from "./reconciliation-state";
import { useBillImportState } from "./bill-import-state";
import { useCategoryManagerState } from "./category-manager-state";
import { removeCategory, restoreCategory, saveCategory } from "./category-actions";
import { createLedger as createLedgerRequest, deleteLedger as deleteLedgerRequest } from "./ledger-actions";
import { createBillImportAccount } from "./ledger-account-actions";
import { processPendingTransaction, saveCategoryBudget as saveCategoryBudgetRequest, settleMember } from "./planning-actions";
import { liquidateAsset, saveAsset } from "./asset-actions";
import { saveFireSettings, saveInflationSettings, saveTheme } from "./settings-actions";
import { loadBillForEdit } from "./bill-actions";
import { syncOfflineEntries as syncOfflineEntriesRequest } from "./offline-actions";
import {
  contributeSavingsGoal,
  createSavingsGoal,
  deleteSavingsGoal,
} from "./savings-goal-actions";
import {
  createInstallment,
  removeInstallment as removeInstallmentRequest,
  removeSubscription as removeSubscriptionRequest,
  saveSubscription,
} from "./recurring-actions";
import { useAssetManagerState } from "./asset-manager-state";
import { useTransactionEditState } from "./transaction-edit-state";
import { useLedgerCharts } from "./chart-lifecycle";
import { useConfirmDialogState } from "./confirm-dialog-state";
import { useBillViewState } from "./bill-view-state";
import { useSubscriptionManagerState } from "./subscription-manager-state";
import { useSavingsGoalManagerState } from "./savings-goal-manager-state";
import { useAccountManagerState } from "./account-manager-state";
import { formatAppDateTime, parseAppDate } from "./date-format";
import { useAppUpdateControl, type AppUpdateInfo } from "./app-update-control";
import { useQuickSyncState } from "./quick-sync-state";
import {
  buildAndroidCompanionConfig,
  buildQuickSyncExample,
  buildQuickSyncTemplate,
  createQuickSyncToken as createQuickSyncTokenRequest,
  loadQuickSyncStatus as loadQuickSyncStatusRequest,
  revokeQuickSyncToken as revokeQuickSyncTokenRequest,
  testQuickSyncConnection as testQuickSyncConnectionRequest,
} from "./quick-sync-actions";
import { useNearbySyncState } from "./nearby-sync-state";
import {
  deleteNearbyPackage,
  downloadNearbyPackage as downloadNearbyPackageRequest,
  uploadNearbyPackage as uploadNearbyPackageRequest,
} from "./nearby-actions";
import { useNotificationCenter } from "./notification-center-state";
import { useTransactionLiveSync } from "./transaction-live-sync-state";
import { useForecastState } from "./forecast-state";
import { useTransactionSummary } from "./transaction-summary-state";
import { useLargeBillQuery } from "./large-bill-query-state";
import { usePwaOfflineState } from "./pwa-offline-state";
import { useBrowserSettingsState } from "./browser-settings-state";
import { useTransactionEntryState } from "./transaction-entry-state";
import { usePlanningState } from "./planning-state";
import { buildLedgerAnalysis, buildPeriodReports } from "./ledger-analysis-core";
import { buildFinancialInsights } from "./financial-insights-core";
import { queryBills } from "./bill-query-core";
import { useAiChatState } from "./ai-chat-state";
import { useWebDavSyncState, type WebDavSyncMode } from "./webdav-sync-state";
import {
  downloadWebDavSnapshot,
  uploadWebDavSnapshot,
} from "./webdav-actions";
import { runWebDavSyncWorkflow } from "./webdav-sync-workflow";
import { useWebDavAutoSync } from "./webdav-auto-sync";
import { useDataCenterLifecycle } from "./data-center-lifecycle";
import { useConfirmDialogLifecycle } from "./confirm-dialog-lifecycle";
import { useTransactionViewLifecycle } from "./transaction-view-lifecycle";
import { useAuthNoticeLifecycle } from "./auth-notice-lifecycle";
import { useAchievementBadgeLifecycle } from "./achievement-badge-lifecycle";
import { runNearbyMergeWorkflow } from "./nearby-sync-workflow";
import { createNearbyPackageWorkflow } from "./nearby-package-workflow";
import { useAppShellState, type ThemeName } from "./app-shell-state";
import { useLedgerRefresh } from "./ledger-refresh";
import { useLedgerAccountActions } from "./ledger-account-actions";
import { useLedgerTransactionActions } from "./ledger-transaction-actions";
import {
  cleanBadBillImports as cleanBadBillImportsRequest,
  previewBillImport,
  useLedgerBillImportActions,
} from "./ledger-bill-import-actions";
import {
  runBillImportWorkflow,
  type BillImportSummary,
} from "./bill-import-workflow";
import { runBillImportAccountWorkflow } from "./bill-import-account-workflow";
import { confirmBillImportWorkflow } from "./confirm-bill-import-workflow";
import { useLedgerEntryActions } from "./ledger-entry-actions";
import { createMember } from "./member-actions";
import {
  fetchClientText,
  MAX_P2P_PACKAGE_RESPONSE_BYTES,
} from "./client-api";
import {
  restoreResultStorageKey,
  useRestoreResult,
} from "./restore-result-state";
import {
  useDataCenterRestoreState,
  type RestoreSnapshot,
  type SyncConflictReport,
} from "./data-center-restore-state";
import {
  restoreSnapshotData,
} from "./restore-actions";
import {
  runRestoreBackupWorkflow,
  runRestoreSnapshotWorkflow,
} from "./restore-workflow";
import { exportLedgerSnapshot } from "./snapshot-actions";

type Mood = "悦己" | "刚需" | "冲动";
type Category = string;
type IncomeCategory = string;
type TransactionType = "支出" | "收入";
type Transaction = {
  id: number;
  title: string;
  amount: number;
  type: TransactionType;
  mood: Mood | null;
  category: Category | null;
  incomeCategory: IncomeCategory | null;
  accountId: number;
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
  updatedAt: string;
  createdAt: string;
};
type TransactionEditDraft = {
  transaction: Transaction;
  type: TransactionType;
  accountId: number;
  mood: Mood;
  category: Category;
  incomeCategory: IncomeCategory;
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
  updatedAt: string;
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
type Ledger = { id: number; name: string; icon: string; updatedAt: string; createdAt: string };
type SavingsGoal = {
  id: number;
  ledgerId: number;
  name: string;
  targetAmount: number;
  savedAmount: number;
  deadline: string;
  icon: string;
  updatedAt: string;
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
type Currency = "CNY" | "USD" | "JPY" | "EUR";
type Member = {
  id: number;
  ledgerId: number;
  name: string;
  icon: string;
  isMe: boolean;
  createdAt: string;
};
type ImportBatch = {
  id: string;
  sourceLabel: string;
  importedCount: number;
  status: "importing" | "completed" | "failed" | "undoing" | "undone";
  undoStartedAt: string | null;
  undoResumable: boolean | number;
  createdAt: string;
  completedAt: string | null;
  undoneAt: string | null;
};
const syncConflictLabel = (row: Record<string, unknown>) =>
  String(row.title ?? row.name ?? row.status ?? row.note ?? row.syncId ?? "记录").slice(0, 80);
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
  updatedAt: string;
  createdAt: string;
};
type DigitalAsset = {
  id: number;
  ledgerId: number;
  name: string;
  assetType: string;
  currency: Currency;
  valuationMode: "自动折旧" | "手动估值";
  manualValue: number | null;
  purchasePrice: number;
  purchaseDate: string;
  lifespanMonths: number;
  residualRateBps: number;
  heatLevel: "高" | "中" | "低" | null;
  updatedAt: string;
  createdAt: string;
  elapsedMonths: number;
  currentValue: number;
  residualValue: number;
  valueChange: number;
  valueLost: number;
  changePercent: number;
  lossPercent: number;
  dailyDepreciation: number;
  heatLambda: number;
};
type Achievement = { ledgerId: number; code: string; unlockedAt: string };
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
type ChartConstructor = new (
  context: CanvasRenderingContext2D,
  config: object,
) => { destroy: () => void };

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
  parseAppDate(value);
const epochNow = () => Date.now();
const toLocalDateTimeInput = (value: string) => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${toLocalDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};
const formatTimestamp = (value: string) => {
  const date = toDate(value);
  return Number.isNaN(date.getTime())
    ? value
    : formatAppDateTime(value, true);
};
const offlineDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("neo-ledger-offline", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("entries", { keyPath: "offlineId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
async function offlinePut(value: Record<string, unknown>) {
  assertOfflineEntryWithinBudget(value);
  const db = await offlineDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("entries", "readwrite");
      const store = tx.objectStore("entries");
      const existingRequest = store.get(String(value.offlineId));
      const countRequest = store.count();
      let existingKnown = false;
      let countKnown = false;
      let existing = false;
      let count = 0;
      let limitError: Error | null = null;
      const maybePut = () => {
        if (!existingKnown || !countKnown || limitError) return;
        if (!offlineQueueHasCapacity(count, existing)) {
          limitError = new Error(`离线队列最多保存 ${MAX_OFFLINE_QUEUE_ENTRIES} 笔，请先联网同步`);
          tx.abort();
          return;
        }
        store.put(value);
      };
      existingRequest.onsuccess = () => { existing = existingRequest.result !== undefined; existingKnown = true; maybePut(); };
      countRequest.onsuccess = () => { count = countRequest.result; countKnown = true; maybePut(); };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(limitError ?? tx.error ?? new Error("离线队列写入失败"));
      tx.onabort = () => reject(limitError ?? tx.error ?? new Error("离线队列写入失败"));
    });
  } finally {
    db.close();
  }
}

async function offlineList() {
  const db = await offlineDb();
  const rows = await new Promise<Record<string, unknown>[]>(
    (resolve, reject) => {
      const request = db.transaction("entries").objectStore("entries").getAll(undefined, MAX_OFFLINE_QUEUE_ENTRIES);
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
export function LedgerApp({
  transactions,
  transactionTotal,
  transactionsTruncated,
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
  authUser,
  authHasUsers,
  addTransaction,
  deleteTransaction,
  updateBudget,
  parseImportText,
}: {
  transactions: Transaction[];
  transactionTotal: number;
  transactionsTruncated: boolean;
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
  authUser: ClientAuthUser | null;
  authHasUsers: boolean;
  addTransaction: (formData: FormData) => Promise<void>;
  deleteTransaction: (id: number) => Promise<{ ok: boolean; error?: string }>;
  updateBudget: (formData: FormData) => Promise<void>;
  parseImportText: (text: string, ledgerId: number) => Promise<ParsedEntry>;
}) {
  const shell = useAppShellState({ initialTheme, authUser });
  const {
    tab,
    currentAuthUser,
    sidebarCollapsed,
    setTab,
    setCurrentAuthUser,
    setSidebarCollapsed,
  } = shell;
  const { clockTick, todayKey } = useLedgerClock();
  const billView = useBillViewState();
  const {
    billQuery,
    setBillQuery,
    billRange,
    setBillRange,
    billAnchorDate,
    setBillAnchorDate,
    billStartDate,
    setBillStartDate,
    billEndDate,
    setBillEndDate,
    billPageState,
    setBillPageState,
    dimension,
    setDimension,
    dateLabels,
    setDateLabels,
    resetBillFilters,
  } = billView;
  const {
    billDataRevision,
    setBillDataRevision,
    optimisticDeletedTransactionIds,
    setOptimisticDeletedTransactionIds,
  } = useBillDataRevisionState();
  const buildDateLabels = () =>
    Object.fromEntries(
        transactions.map((item) => [
          item.id,
          formatAppDateTime(item.occurredAt),
        ]),
      );
  const {
    entryOpen,
    budgetOpen,
    dataOpen,
    authOpen,
    noticeOpen,
    ledgerMenuOpen,
    theme,
    aestheticOpen,
    installmentOpen,
    badgeOpen,
    badgeFocusCode,
    chartReady,
    toast,
    setEntryOpen,
    setBudgetOpen,
    setDataOpen,
    setAuthOpen,
    setNoticeOpen,
    setLedgerMenuOpen,
    setTheme,
    setAestheticOpen,
    setInstallmentOpen,
    setBadgeOpen,
    setBadgeFocusCode,
    setChartReady,
    setToast,
  } = shell;
  const accountManager = useAccountManagerState<Account>({ accounts });
  const {
    accounts: accountList,
    setAccounts: setAccountList,
    transferOpen,
    setTransferOpen,
    open: accountOpen,
    editing: editingAccount,
    accountType,
    editorError: accountError,
    transferError,
    setOpen: setAccountOpen,
    setAccountType,
    setEditorError: setAccountError,
    setTransferError,
  } = accountManager;
  // 应用内替代 window.alert / confirm / prompt。原生对话框会阻塞页面线程，
  // 且 Chrome 允许用户勾选“阻止此页面创建更多对话框”，一旦勾选，删除账本、
  // 恢复备份等流程会静默失效。
  const confirmDialog = useConfirmDialogState();
  const { ask, askValue, setAskValue, settleAsk: settleConfirmAsk } = confirmDialog;
  const subscriptionManager = useSubscriptionManagerState<Subscription>(subscriptions);
  const {
    subscriptionOpen,
    editingSubscription,
    subscriptionError,
    subscriptionCategory,
    subscriptionCategoryOpen,
    subscriptionCategoryError,
    subscriptionCategoryDraft,
    subscriptionList,
    subscriptionPage,
    setSubscriptionOpen,
    setSubscriptionError,
    setSubscriptionCategory,
    setSubscriptionCategoryOpen,
    setSubscriptionCategoryError,
    setSubscriptionCategoryDraft,
    setSubscriptionList,
    setSubscriptionPage,
    openSubscriptionEditor,
    closeSubscriptionEditor,
    resetSubscriptionCategoryDraft,
  } = subscriptionManager;
  const dataCenterRestore = useDataCenterRestoreState({ active: dataOpen });
  const { restoreSnapshots, lastMergeReport, setLastMergeReport } = dataCenterRestore;
  const appUpdate = useAppUpdateControl();
  const { info: updateInfo, checking: updateChecking, applying: updateApplying, error: updateError } = appUpdate;
  const planningState = usePlanningState({
    categoryBudgets,
    members,
    fireConfig: fireSetting,
    inflationConfig: economicSetting,
  });
  const {
    categoryBudgetList,
    categoryBudgetPage,
    setCategoryBudgetList,
    setCategoryBudgetPage,
    memberList,
    setMemberList,
    settlementPage,
    setSettlementPage,
    installmentPage,
    setInstallmentPage,
    stressEvents,
    setStressEvents,
    fireConfig,
    setFireConfig,
    inflationConfig,
    setInflationConfig,
  } = planningState;
  const categoryManager = useCategoryManagerState<ExpenseCategory>({
    categories: expenseCategories,
    incomeCategories,
  });
  const {
    categoryList,
    setCategoryList,
    categoryManagerOpen,
    setCategoryManagerOpen,
    editingCategory,
    setEditingCategory,
    categoryError,
    setCategoryError,
    incomeCategoryList,
    setIncomeCategoryList,
    incomeManagerOpen,
    setIncomeManagerOpen,
    editingIncomeCategory,
    setEditingIncomeCategory,
    incomeCategoryError,
    setIncomeCategoryError,
  } = categoryManager;
  const transactionEntry = useTransactionEntryState<ParsedEntry, Mood, Category>({
    category: expenseCategories.find((item) => item.isActive)?.name ?? "餐饮",
    incomeCategory: incomeCategories.find((item) => item.isActive)?.name ?? "薪资发放",
    accountId: accounts[0]?.id ?? 0,
    mood: "刚需",
  });
  const {
    entryType,
    setEntryType,
    reflection,
    setReflection,
    mood,
    setMood,
    category,
    setCategory,
    incomeCategory,
    setIncomeCategory,
    accountId,
    setAccountId,
    importText,
    setImportText,
    parsedAmount,
    parsedTitle,
    parsedPreview,
    setParsedPreview,
    receiptUrl,
    setReceiptUrl,
    scanning,
    setScanning,
    splitMode,
    setSplitMode,
    splitMemberId,
    setSplitMemberId,
    mySharePercent,
    setMySharePercent,
    resetImport,
    resetSplit,
  } = transactionEntry;
  const transactionEditManager = useTransactionEditState<TransactionEditDraft>();
  const {
    open: transactionEditOpen,
    setOpen: setTransactionEditOpen,
    draft: transactionEdit,
    setDraft: setTransactionEdit,
    error: transactionEditError,
    setError: setTransactionEditError,
  } = transactionEditManager;
  const savingsGoalManager = useSavingsGoalManagerState<SavingsGoal>(savingsGoals);
  const {
    goalList,
    goalPage,
    goalOpen,
    savingGoal,
    goalError,
    setGoalList,
    setGoalPage,
    setGoalOpen,
    setGoalError,
    openSavingsGoalEditor,
    closeSavingsGoalEditor,
  } = savingsGoalManager;
  const privacyLock = usePrivacyLock(lockEnabled);
  const locked = privacyLock.locked;

  const installmentList = installments;
  const assetManager = useAssetManagerState<DigitalAsset>(digitalAssets);
  const {
    digitalAssetList,
    setDigitalAssetList,
    digitalAssetPage,
    setDigitalAssetPage,
    assetOpen,
    setAssetOpen,
    editingAsset,
    setEditingAsset,
    assetType,
    setAssetType,
    assetValuationMode,
    setAssetValuationMode,
    assetError,
    setAssetError,
    liquidatingAsset,
    setLiquidatingAsset,
  } = assetManager;
  const billImport = useBillImportState<ImportedBill, BillImportSummary, ImportBatch>();
  const {
    items: billImportItems,
    error: billImportError,
    status: billImportStatus,
    summary: billImportSummary,
    batches: importBatches,
    manualAccountKeys: billManualAccountKeys,
    accountActionKey: billAccountActionKey,
    setItems: setBillImportItems,
    setError: setBillImportError,
    setStatus: setBillImportStatus,
    setSummary: setBillImportSummary,
    setBatches: setImportBatches,
    setManualAccountKeys: setBillManualAccountKeys,
    setAccountActionKey: setBillAccountActionKey,
  } = billImport;
  const notificationCenter = useNotificationCenter({ ledgerId: currentLedgerId, active: noticeOpen });
  const { pendingFlows, pendingTotal, notices: systemNotices, reload: reloadPendingFlows, markRead: markNoticesRead, requestDesktopNotifications } = notificationCenter;
  const pwaOffline = usePwaOfflineState({ listOffline: offlineList, syncOffline: syncOfflineEntries });
  const { installPrompt, offlineCount, isOnline, install: installPwa, syncNow: syncOfflineNow, refreshCount: refreshOfflineCount } = pwaOffline;
  const restoreResult = useRestoreResult();
  const aiChat = useAiChatState({ ledgerId: currentLedgerId });
  const {
    messages: chatMessages,
    consent: aiExternalConsent,
    input: chatInput,
    pending: chatPending,
    setInput: setChatInput,
    setConsent: setAiExternalConsent,
    ask: askNeoAi,
  } = aiChat;
  const webdavSync = useWebDavSyncState();
  const {
    status: syncStatus,
    syncing,
    mode: webdavSyncMode,
    select: selectWebdavSyncMode,
    setStatus: setSyncStatus,
  } = webdavSync;
  const p2pRoom = "neo-home";
  const nearbySync = useNearbySyncState({ active: dataOpen, room: p2pRoom });
  const {
    pairingCode: nearbyPairingCode,
    setPairingCode: setNearbyPairingCode,
    receiveCode: nearbyReceiveCode,
    setReceiveCode: setNearbyReceiveCode,
    status: nearbyStatus,
    setStatus: setNearbyStatus,
    download: nearbyDownload,
    setDownload: setNearbyDownload,
    packages: nearbyLanPackages,
    packageId: nearbyLanPackageId,
    setPackageId: setNearbyLanPackageId,
    uploading: nearbyLanUploading,
    setUploading: setNearbyLanUploading,
    accessUrl: nearbyAccessUrl,
    refreshAddress: refreshNearbyAddress,
    setNode: setP2pNode,
    peers: nearbyPeers,
  } = nearbySync;
  const browserSettings = useBrowserSettingsState({ setP2pNode });
  const {
    browserStateReady,
    webdavConfig,
    setWebdavConfig,
    webdavSession,
    setWebdavSession,
  } = browserSettings;
  const quickSync = useQuickSyncState();
  const {
    status: quickSyncStatus,
    token: quickSyncToken,
    message: quickSyncMessage,
    label: quickSyncLabel,
    expiryDays: quickSyncExpiryDays,
    setStatus: setQuickSyncStatus,
    setMessage: setQuickSyncMessage,
    setLabel: setQuickSyncLabel,
    setExpiryDays: setQuickSyncExpiryDays,
  } = quickSync;
  const forecast = useForecastState({ active: tab === "analytics", ledgerId: currentLedgerId, transactionsKey: transactions, subscriptionsKey: subscriptions });
  const serverSummary = useTransactionSummary({
    ledgerId: currentLedgerId,
    todayKey,
    dimension,
    clockTick,
    revision: `${transactions.length}:${transactions[0]?.updatedAt ?? ""}:${billDataRevision}`,
  });
  const [pending, startTransition] = useTransition();
  const { dismissed: onboardingDismissed, dismiss: dismissOnboarding } = useOnboardingState(currentLedgerId);
  const entryRef = useRef<HTMLDialogElement>(null);
  const transactionEditRef = useRef<HTMLDialogElement>(null);
  const billListRef = useRef<HTMLElement>(null);
  const digitalAssetListRef = useRef<HTMLElement>(null);
  const subscriptionListRef = useRef<HTMLElement>(null);
  const settlementListRef = useRef<HTMLElement>(null);
  const goalListRef = useRef<HTMLElement>(null);
  const installmentListRef = useRef<HTMLElement>(null);
  const categoryBudgetListRef = useRef<HTMLDivElement>(null);
  const budgetRef = useRef<HTMLDialogElement>(null);
  const accountRef = useRef<HTMLDialogElement>(null);
  const transferRef = useRef<HTMLDialogElement>(null);
  const subscriptionRef = useRef<HTMLDialogElement>(null);
  const dataRef = useRef<HTMLDialogElement>(null);
  const authRef = useRef<HTMLDialogElement>(null);
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
  const askRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const refreshRoute = useCallback(() => router.refresh(), [router]);
  const ledgerRefresh = useLedgerRefresh({
    ledgerId: currentLedgerId,
    refreshRoute,
    setAccounts: setAccountList,
    setAccountId,
    setGoals: setGoalList,
    setSubscriptions: setSubscriptionList,
    setDigitalAssets: setDigitalAssetList,
    setCategories: setCategoryList,
    setCategory,
    setCategoryBudgets: setCategoryBudgetList,
    setIncomeCategories: setIncomeCategoryList,
    setIncomeCategory,
  });
  const {
    reloadAccounts,
    reloadGoals,
    reloadSubscriptions,
    reloadDigitalAssets,
    reloadCategories,
    reloadIncomeCategories,
    refreshLedger,
  } = ledgerRefresh;
  useTransactionLiveSync({
    ledgerId: currentLedgerId,
    onChanged: () => {
      setBillDataRevision((value) => value + 1);
      refreshRoute();
      void reloadPendingFlows();
    },
  });
  const ledgerAccountActions = useLedgerAccountActions({
    ledgerId: currentLedgerId,
    accountList,
    editingAccount,
    accountType,
    startTransition,
    setAccountError,
    setTransferError,
    reloadAccounts,
    closeAccount: () => closeDialog(accountRef, setAccountOpen),
    closeTransfer: () => closeDialog(transferRef, setTransferOpen),
    notifySuccess: (message) => setToast({ kind: "success", message }),
  });
  const {
    submitAccount,
    submitTransfer,
    removeAccount: removeAccountRequest,
  } = ledgerAccountActions;
  async function confirmRemoveAccount() {
    if (!editingAccount) return;
    const agreed = await confirmAsk({
      title: `注销账户「${editingAccount.name}」`,
      message: "注销会移除账户及其当前余额记录；只有没有账单、转账、订阅、待确认流水或分期引用时才能注销。此操作不可撤销。",
      tone: "danger",
      confirmText: "确认注销",
    });
    if (agreed) removeAccountRequest();
  }
  const ledgerTransactionActions = useLedgerTransactionActions({
    ledgerId: currentLedgerId,
    draft: transactionEdit,
    startTransition,
    setError: setTransactionEditError,
    closeEditor: closeTransactionEditor,
    reloadLedger: refreshLedger,
    notifySuccess: (message) => setToast({ kind: "success", message }),
  });
  const { submitTransactionEdit } = ledgerTransactionActions;
  const ledgerBillImportActions = useLedgerBillImportActions<ImportedBill, ImportBatch>({
    ledgerId: currentLedgerId,
    startTransition,
    setError: setBillImportError,
    setBatches: setImportBatches,
    confirmAsk,
    notify,
    refreshLedger,
  });
  const {
    submitBillRows,
    loadImportBatches,
    undoImportBatch,
  } = ledgerBillImportActions;
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
  const refreshTransactionView = () => {
    void reloadAccounts();
    setDateLabels(buildDateLabels());
  };

  useTransactionViewLifecycle({ transactions, refresh: refreshTransactionView });
  useAuthNoticeLifecycle({ openAuth: () => openDialog(authRef, setAuthOpen) });
  useWebDavAutoSync({
    browserStateReady,
    config: {
      autoSync: webdavConfig.autoSync,
      intervalMinutes: webdavConfig.intervalMinutes,
      url: webdavConfig.url,
      username: webdavConfig.username,
      password: webdavSession.password,
      secret: webdavSession.secret,
    },
    runSync: runWebDavSync,
  });
  useDataCenterLifecycle({
    active: dataOpen,
    updateAvailable: Boolean(updateInfo),
    checkUpdate: appUpdate.check,
    loadQuickSyncStatus,
    loadImportBatches,
  });
  useAchievementBadgeLifecycle({
    active: tab === "assets",
    todayKey,
    ledgerId: currentLedgerId,
    locked,
    badges: badgeDefinitions,
    achievements,
    tierRank: badgeTierRank,
    setFocusCode: setBadgeFocusCode,
    openBadge: () => openDialog(badgeRef, setBadgeOpen),
  });

  async function syncOfflineEntries() {
    const before = await offlineList();
    const remaining = await syncOfflineEntriesRequest({
      online: navigator.onLine,
      list: offlineList,
      remove: offlineDelete,
    });
    if (remaining < before.length) window.location.reload();
    return remaining;
  }

  const analysis = useMemo(
    () => {
      const local = buildLedgerAnalysis({
        transactions: transactionsTruncated && !serverSummary ? [] : transactions,
        dimension,
        todayKey,
        exchangeRates,
        categoryNames: allCategoryNames,
        incomeCategoryNames: allIncomeCategoryNames,
        moods,
      });
      if (!serverSummary) return local;
      return { ...local, ...serverSummary.analysis, filtered: local.filtered };
    },
    [
      transactions,
      dimension,
      todayKey,
      exchangeRates,
      allCategoryNames,
      allIncomeCategoryNames,
      serverSummary,
      transactionsTruncated,
    ],
  );
  const periodReports = useMemo(
    () => {
      const local = buildPeriodReports({
        todayKey,
        transactions: transactionsTruncated && !serverSummary ? [] : transactions,
        exchangeRates,
        nowMs: clockTick,
      });
      return serverSummary?.periodReports ?? local;
    },
    [todayKey, transactions, exchangeRates, clockTick, serverSummary, transactionsTruncated],
  );


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
      [...new Set((serverSummary?.availableYears ?? (transactionsTruncated ? [] : transactions.map((item) => toDate(item.occurredAt).getFullYear()))))]
        .sort((a, b) => b - a),
    [transactions, serverSummary, transactionsTruncated],
  );
  const billAnchorKey = normalizeBillAnchor(billAnchorDate, todayKey);
  const billPeriodYears = useMemo(() => {
    const anchorYear = Number(billAnchorKey.slice(0, 4));
    const currentYear = Number(todayKey.slice(0, 4));
    return [
      ...new Set(
        [...availableBillYears, anchorYear, currentYear].filter(
          (year) => Number.isInteger(year) && year > 0,
        ),
      ),
    ].sort((a, b) => b - a);
  }, [availableBillYears, billAnchorKey, todayKey]);
  const billPageKey = JSON.stringify([
    billQuery,
    billRange,
    billAnchorKey,
    billStartDate,
    billEndDate,
  ]);
  const requestedBillPage = billPageState.key === billPageKey ? billPageState.page : 1;
  const largeBillQuery = useLargeBillQuery({
    enabled: transactionsTruncated && tab === "bills",
    ledgerId: currentLedgerId,
    revision: billDataRevision,
    page: requestedBillPage,
    pageSize: BILL_PAGE_SIZE,
    query: billQuery,
    range: billRange,
    anchor: billAnchorKey,
    startDate: billStartDate,
    endDate: billEndDate,
  });
  const localBillResults = useMemo(
    () =>
      queryBills({
        transactions,
        accounts: accountList,
        anchorKey: billAnchorKey,
        query: billQuery,
        range: billRange,
        startDate: billStartDate,
        endDate: billEndDate,
        exchangeRates,
      }),
    [
      transactions,
      accountList,
      billAnchorKey,
      billQuery,
      billRange,
      billStartDate,
      billEndDate,
      exchangeRates,
    ],
  );
  const billResults = transactionsTruncated && largeBillQuery
    ? { rows: largeBillQuery.rows, income: largeBillQuery.income, expense: largeBillQuery.expense, balance: largeBillQuery.balance }
    : localBillResults;
  const billPage = transactionsTruncated && largeBillQuery
    ? {
        rows: largeBillQuery.rows,
        page: requestedBillPage,
        pageSize: BILL_PAGE_SIZE,
        totalPages: Math.max(1, Math.ceil(largeBillQuery.total / BILL_PAGE_SIZE)),
        totalRows: largeBillQuery.total,
      }
    : paginateBills(
    localBillResults.rows,
    requestedBillPage,
  ) as {
    rows: Transaction[];
    page: number;
    pageSize: number;
    totalPages: number;
    totalRows: number;
  };
  const reconciliationTransactionIds = billPage.rows.map((item) => item.id);
  const reconciliation = useReconciliationState({
    active: tab === "bills" && !locked,
    ledgerId: currentLedgerId,
    transactionIds: reconciliationTransactionIds,
    refreshKey: `${transactions.length}:${reconciliationTransactionIds.join(",")}`,
    onNotify: (kind, message) => setToast({ kind, message }),
  });
  async function editBillRow(row: BillSectionRow) {
    const local = transactions.find((item) => item.id === row.id);
    if (local) {
      showTransactionEditor(local);
      return;
    }
    try {
      const { item: remote, error } = await loadBillForEdit<Transaction>(currentLedgerId, row.id);
      if (remote) showTransactionEditor(remote);
      else notify(error || "读取账单失败，请刷新后重试。");
    } catch (error) {
      notify(error instanceof Error ? error.message : "读取账单失败，请刷新后重试。");
    }
  }

  const settlements = useMemo(
    () => {
      const summarized = serverSummary?.dashboard.settlements;
      if (summarized) {
        const balances = new Map(summarized.map((item) => [item.memberId, item.balance]));
        return memberList
          .filter((member) => !member.isMe)
          .map((member) => ({ member, balance: balances.get(member.id) ?? 0 }))
          .filter((item) => item.balance !== 0);
      }
      if (transactionsTruncated) return [];
      return memberList
        .filter((member) => !member.isMe)
        .map((member) => {
          let balance = 0;
          for (const item of transactions) {
            if (item.splitWithMemberId !== member.id) continue;
            const cny = item.amount * exchangeRates[item.currency];
            balance += splitBalanceDelta(cny, item.splitMode, item.mySharePercent);
          }
          return { member, balance };
        })
        .filter((item) => item.balance !== 0);
    },
    [memberList, transactions, exchangeRates, serverSummary, transactionsTruncated],
  );
  const subscriptionPageData = paginateBills(
    subscriptionList,
    subscriptionPage,
    COLLECTION_PAGE_SIZE,
  ) as {
    rows: Subscription[];
    page: number;
    totalPages: number;
    totalRows: number;
  };
  const goalPageData = paginateBills(
    goalList,
    goalPage,
    COLLECTION_PAGE_SIZE,
  ) as {
    rows: SavingsGoal[];
    page: number;
    totalPages: number;
    totalRows: number;
  };
  const installmentPageData = paginateBills(
    installmentList,
    installmentPage,
    COLLECTION_PAGE_SIZE,
  ) as {
    rows: Installment[];
    page: number;
    totalPages: number;
    totalRows: number;
  };
  const categoryBudgetPageData = paginateBills(
    categories,
    categoryBudgetPage,
    COLLECTION_PAGE_SIZE,
  ) as {
    rows: Category[];
    page: number;
    totalPages: number;
    totalRows: number;
  };
  const settlementPageData = paginateBills(
    memberList.filter((member) => !member.isMe),
    settlementPage,
    COLLECTION_PAGE_SIZE,
  ) as {
    rows: Member[];
    page: number;
    totalPages: number;
    totalRows: number;
  };
  const settlementPageMemberIds = new Set(
    settlementPageData.rows.map((member) => member.id),
  );
  const visibleSettlements = settlements.filter(({ member }) =>
    settlementPageMemberIds.has(member.id),
  );

  useLedgerCharts({
    chartReady,
    tab,
    theme,
    analysis,
    categoryMeta,
    incomeMeta,
    moodMeta,
    forecast,
    inflationBps: inflationConfig.inflationBps,
    pieCanvas,
    moodCanvas,
    lineCanvas,
    forecastCanvas,
  });

  const monthExpense = serverSummary?.dashboard.monthExpense ?? (transactionsTruncated ? 0 : transactions
    .filter((item) => {
      if (item.type !== "支出") return false;
      if (!todayKey) return true;
      const date = toDate(item.occurredAt);
      const anchor = new Date(`${todayKey}T12:00:00`);
      return date.getFullYear() === anchor.getFullYear() && date.getMonth() === anchor.getMonth();
    })
    .reduce((sum, item) => sum + item.amount * exchangeRates[item.currency], 0));
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
    (sum, item) => sum + item.currentValue * exchangeRates[item.currency],
    0,
  );
  const digitalAssetPageData = paginateBills(
    digitalAssetList,
    digitalAssetPage,
    ASSET_PAGE_SIZE,
  ) as {
    rows: DigitalAsset[];
    page: number;
    pageSize: number;
    totalPages: number;
    totalRows: number;
  };
  const insights = buildFinancialInsights({
    accountList,
    transactions,
    deductions,
    exchangeRates,
    assetTotal: financialAssetTotal + digitalAssetTotal,
    fireConfig,
    inflationConfig,
    stressEvents,
    forecast,
    serverSummary,
    transactionsTruncated,
    todayKey,
  });
  const {
    assetTotal,
    liabilityTotal,
    inflationRate,
    realNetWorthOneYear,
    rank,
  } = insights;
  const focusedBadge = badgeFocusCode
    ? (badgeDefinitions.find((badge) => badge.code === badgeFocusCode) ?? null)
    : null;
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
  function notify(message: string, kind: "warning" | "success" = "warning") {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 5200);
  }
  useConfirmDialogLifecycle({ open: Boolean(ask), dialogRef: askRef });
  function confirmAsk(options: {
    title: string;
    message: string;
    tone?: "danger" | "normal";
    confirmText?: string;
    input?: { label: string; defaultValue: string; placeholder?: string };
  }) {
    return confirmDialog.confirmAsk({
      title: options.title,
      message: options.message,
      tone: options.tone ?? "normal",
      confirmText: options.confirmText ?? "确定",
      input: options.input,
    });
  }
  function settleAsk(value: string | null) {
    askRef.current?.close();
    settleConfirmAsk(value);
  }
  function requestDeleteTransaction(id: number) {
    setOptimisticDeletedTransactionIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    startTransition(async () => {
      const result = await deleteTransaction(id);
      if (result.ok) {
        // Large ledgers are loaded through the client-side paged query. Its
        // inputs do not change after a delete, so explicitly invalidate that
        // query or the deleted row remains visible until a manual refresh.
        setBillDataRevision((current) => current + 1);
        // Server actions invalidate the route cache, but an already-mounted
        // client page still needs an explicit refresh to remove the row and
        // recalculate the visible totals immediately.
        await refreshLedger().catch(() => undefined);
      } else {
        setOptimisticDeletedTransactionIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
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
  function changeBillPage(page: number) {
    setBillPageState({ key: billPageKey, page });
    window.requestAnimationFrame(() => {
      billListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }
  function changeDigitalAssetPage(page: number) {
    setDigitalAssetPage(page);
    window.requestAnimationFrame(() => {
      digitalAssetListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }
  function changeSubscriptionPage(page: number) {
    setSubscriptionPage(page);
    window.requestAnimationFrame(() =>
      subscriptionListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }
  function changeSettlementPage(page: number) {
    setSettlementPage(page);
    window.requestAnimationFrame(() =>
      settlementListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }
  function changeGoalPage(page: number) {
    setGoalPage(page);
    window.requestAnimationFrame(() =>
      goalListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }
  function changeInstallmentPage(page: number) {
    setInstallmentPage(page);
    window.requestAnimationFrame(() =>
      installmentListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }
  function changeCategoryBudgetPage(page: number) {
    setCategoryBudgetPage(page);
    window.requestAnimationFrame(() =>
      categoryBudgetListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }
  function showAssetEditor(asset: DigitalAsset | null = null) {
    setEditingAsset(asset);
    const knownType = asset
      ? ASSET_TYPE_OPTIONS.some((option) => option.name === asset.assetType)
      : true;
    setAssetType(asset ? (knownType ? asset.assetType : "其他资产") : "数码设备");
    setAssetValuationMode(asset?.valuationMode ?? "自动折旧");
    setAssetError("");
    openDialog(assetRef, setAssetOpen);
  }
  function closeAssetEditor() {
    closeDialog(assetRef, setAssetOpen);
    assetManager.closeAssetEditorState();
  }
  function chooseAssetType(name: string) {
    setAssetType(name);
    const option = ASSET_TYPE_OPTIONS.find((item) => item.name === name);
    if (option)
      setAssetValuationMode(
        option.mode as DigitalAsset["valuationMode"],
      );
  }
  function showTransactionEditor(transaction: Transaction) {
    transactionEditManager.openEditor({
      transaction,
      type: transaction.type,
      accountId: transaction.accountId,
      mood: transaction.mood ?? "刚需",
      category: transaction.category ?? categories[0] ?? "餐饮",
      incomeCategory:
        transaction.incomeCategory ??
        activeIncomeCategories[0] ??
        "其它收入",
    });
    openDialog(transactionEditRef, setTransactionEditOpen);
  }
  function closeTransactionEditor() {
    closeDialog(transactionEditRef, setTransactionEditOpen);
    transactionEditManager.closeEditor();
  }
  function saveInflation(formData: FormData) {
    startTransition(async () => {
      try {
        const inflationRate = Number(formData.get("inflationRate"));
        const result = await saveInflationSettings({ ledgerId: currentLedgerId, inflationRate });
        if (result.ok)
          setInflationConfig({
            ledgerId: currentLedgerId,
            inflationBps: Math.round(inflationRate * 100),
            updatedAt: new Date().toISOString(),
          });
        else notify(result.error || "通胀设置保存失败");
      } catch (error) {
        notify(error instanceof Error ? error.message : "通胀设置保存失败，请稍后重试");
      }
    });
  }
  function saveFire(formData: FormData) {
    startTransition(async () => {
      try {
        const monthlyExpense = Number(formData.get("monthlyExpense")),
          annualReturn = Number(formData.get("annualReturn"));
        const result = await saveFireSettings({ ledgerId: currentLedgerId, monthlyExpense, annualReturn });
        if (result.ok)
          setFireConfig({
            ledgerId: currentLedgerId,
            monthlyExpense: Math.round(monthlyExpense * 100),
            annualReturnBps: Math.round(annualReturn * 100),
            updatedAt: new Date().toISOString(),
          });
        else notify(result.error || "FIRE 设置保存失败");
      } catch (error) {
        notify(error instanceof Error ? error.message : "FIRE 设置保存失败，请稍后重试");
      }
    });
  }
  function applyAppUpdate() {
    void appUpdate.apply({
      confirm: async (info: AppUpdateInfo) =>
        Boolean(await confirmAsk({
          title: `升级到 v${info.latestVersion}`,
          message: "程序会先备份账本数据库，升级期间将自动重启。",
          confirmText: "开始升级",
        })),
      onApplied: (version) => {
        setToast({ kind: "success", message: `已升级到 v${version}，账本数据保持不变。` });
        window.setTimeout(() => window.location.reload(), 800);
      },
    });
  }
  async function loadQuickSyncStatus() {
    try {
      const { response, data } = await loadQuickSyncStatusRequest();
      if (response.ok)
        setQuickSyncStatus(data ?? { active: false });
    } catch {
      setQuickSyncMessage("暂时无法读取自动记账密钥状态");
    }
  }
  function createQuickSyncToken() {
    setQuickSyncMessage("");
    startTransition(async () => {
      const { response, data } = await createQuickSyncTokenRequest({
        label: quickSyncLabel,
        expiresInDays: quickSyncExpiryDays,
      });
      const result = data;
      if (!response.ok || !result?.token) {
        setQuickSyncMessage(result?.error || "生成密钥失败");
        return;
      }
      quickSync.created(result, result.token, quickSyncLabel);
    });
  }
  async function createAndCopyAndroidConfig() {
    setQuickSyncMessage("正在生成安卓配置…");
    startTransition(async () => {
      const { response, data } = await createQuickSyncTokenRequest({
        label: quickSyncLabel,
        expiresInDays: quickSyncExpiryDays,
      });
      const result = data;
      if (!response.ok || !result?.token) {
        setQuickSyncMessage(result?.error || "生成安卓配置失败");
        return;
      }
      quickSync.created(result, result.token, quickSyncLabel);
      const origin = (nearbyAccessUrl || window.location.origin).replace(/\/+$/, "");
      const config = buildAndroidCompanionConfig({
        origin,
        token: result.token,
        ledgerId: currentLedgerId,
      });
      const copied = await copyToClipboard(config);
      setQuickSyncMessage(
        origin.includes("localhost") || origin.includes("127.0.0.1")
          ? "配置已生成，但当前是本机地址；请先开启局域网访问后重新复制。"
          : copied
            ? "安卓配置已生成并复制；打开伴侣 App 粘贴即可。"
            : "安卓配置已生成，请手动复制后粘贴到伴侣 App。",
      );
    });
  }
  async function revokeQuickSyncToken() {
    const agreed = await confirmAsk({
      title: "撤销自动记账密钥",
      message: "撤销后，所有使用旧密钥的自动记账都会立即失效。",
      tone: "danger",
      confirmText: "撤销",
    });
    if (!agreed) return;
    startTransition(async () => {
      try {
        const { response, data } = await revokeQuickSyncTokenRequest();
        if (!response.ok) {
          setQuickSyncMessage(data?.error ?? "撤销失败，请稍后重试");
          return;
        }
        quickSync.revoked();
      } catch (error) {
        setQuickSyncMessage(error instanceof Error ? error.message : "撤销失败，请稍后重试");
      }
    });
  }
  async function copyToClipboard(value: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {}
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
  async function copyQuickSyncExample() {
    if (!quickSyncToken) return;
    const command = buildQuickSyncExample({
      origin: window.location.origin,
      token: quickSyncToken,
      ledgerId: currentLedgerId,
    });
    await copyToClipboard(command);
    setQuickSyncMessage("请求示例已复制，可粘贴到终端、快捷指令或 NAS 自动化中。");
  }
  async function copyAndroidCompanionConfig() {
    if (!quickSyncToken) return;
    const origin = (nearbyAccessUrl || window.location.origin).replace(/\/+$/, "");
    const config = buildAndroidCompanionConfig({
      origin,
      token: quickSyncToken,
      ledgerId: currentLedgerId,
    });
    await copyToClipboard(config);
    setQuickSyncMessage(
      origin.includes("localhost") || origin.includes("127.0.0.1")
        ? "配置已复制，但当前是本机地址；请先启动局域网访问，再复制给手机。"
        : "安卓配置已复制；在手机伴侣中点击“从 Neo Ledger 粘贴配置”。",
    );
  }
  async function testQuickSyncConnection() {
    if (!quickSyncToken) {
      setQuickSyncMessage("测试需要当前完整密钥，请重新生成密钥后再试。");
      return;
    }
    setQuickSyncMessage("正在发送一笔 ¥0.01 的测试账单…");
    const { response, data } = await testQuickSyncConnectionRequest({
      token: quickSyncToken,
      ledgerId: currentLedgerId,
    });
    const result = data ?? {};
    if (!response.ok || !result.id) {
      setQuickSyncMessage(result.error || "连接测试失败");
      return;
    }
    setQuickSyncMessage("连接测试成功，已新增一笔 ¥0.01 的测试账单。");
    setToast({ kind: "success", message: "自动记账连接正常，测试账单已入账。" });
    await Promise.all([loadQuickSyncStatus(), refreshLedger()]);
  }
  async function copyQuickSyncTemplate(kind: "shortcut" | "notification") {
    if (!quickSyncToken) return;
    const template = buildQuickSyncTemplate({
      kind,
      origin: window.location.origin,
      token: quickSyncToken,
      ledgerId: currentLedgerId,
    });
    await copyToClipboard(template);
    setQuickSyncMessage(
      kind === "shortcut"
        ? "快捷指令配置已复制，可用于“获取 URL 内容”。"
        : "通知转发配置已复制，可导入支持自定义 Webhook 的工具。",
    );
  }
  function makeNearbyCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return [...bytes].map((value) => alphabet[value % alphabet.length]).join("");
  }
  function downloadNearbyPackage() {
    if (!nearbyDownload) return;
    const link = document.createElement("a");
    link.href = nearbyDownload.url;
    link.download = nearbyDownload.name;
    link.click();
    setNearbyStatus("同步包已下载，请通过 AirDrop、微信或局域网发送给另一台设备。");
  }
  async function uploadNearbyPackage() {
    if (!nearbyDownload || nearbyLanUploading) return;
    setNearbyLanUploading(true);
    setNearbyStatus("正在上传到本机局域网，手机稍后可直接获取…");
    try {
      const { text: payload } = await fetchClientText(
        nearbyDownload.url,
        {},
        MAX_P2P_PACKAGE_RESPONSE_BYTES,
      );
      const { response, data } = await uploadNearbyPackageRequest({
        room: p2pRoom,
        payload,
      });
      const result = data ?? {};
      if (!response.ok || !result.id) throw new Error(result.error || "上传失败");
      setNearbyLanPackageId(result.id);
      setNearbyStatus("已发送到局域网，接收设备可在下方直接获取。");
    } catch (error) {
      setNearbyStatus(error instanceof Error ? error.message : "上传局域网同步包失败");
    } finally {
      setNearbyLanUploading(false);
    }
  }
  async function mergeNearbyPayload(payload: string, code: string, packageId = "") {
    const result = await runNearbyMergeWorkflow({
      payload,
      pairingCode: code,
      packageId,
      room: p2pRoom,
      decrypt: decryptSyncPayload,
      exportSnapshot: exportLedgerSnapshot,
      merge: mergeSyncSnapshots,
      restore: (snapshot) => restoreSnapshotData({ snapshot }),
      deletePackage: (room, id) => deleteNearbyPackage({ room, packageId: id }),
    });
    if (result.mergeReport) {
      setLastMergeReport(result.mergeReport as SyncConflictReport);
      localStorage.setItem("neo-last-merge-report", JSON.stringify(result.mergeReport));
    }
    setNearbyStatus(result.status);
    window.setTimeout(() => window.location.reload(), 500);
  }
  async function createNearbyPackage() {
    setNearbyStatus("正在整理并加密全部账本…");
    try {
      const result = await createNearbyPackageWorkflow({
        exportSnapshot: exportLedgerSnapshot,
        makePairingCode: makeNearbyCode,
        encrypt: encryptSyncPayload,
      });
      const file = new File(
        [result.payload],
        result.fileName,
        { type: "application/octet-stream" },
      );
      setNearbyPairingCode(result.pairingCode);
      setNearbyDownload({
        url: URL.createObjectURL(file),
        name: file.name,
      });
      setNearbyStatus("同步包已准备好，请点击“通过局域网发送”。");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setNearbyStatus("已取消分享，同步包没有发送。");
        return;
      }
      setNearbyStatus(error instanceof Error ? error.message : "生成同步包失败");
    }
  }
  function receiveNearbyLanPackage(packageId: string) {
    const code = nearbyReceiveCode.trim().toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(code)) {
      setNearbyStatus("请先输入发送设备显示的 8 位配对码。");
      return;
    }
    setNearbyStatus("正在从局域网获取并合并同步包…");
    startTransition(async () => {
      try {
        const { response, data } = await downloadNearbyPackageRequest({
          room: p2pRoom,
          packageId,
        });
        const result = data ?? {};
        if (!response.ok || !result.payload)
          throw new Error(result.error || "同步包已过期");
        await mergeNearbyPayload(result.payload, code, packageId);
      } catch (error) {
        setNearbyStatus(
          error instanceof Error ? error.message : "局域网同步失败，请检查配对码",
        );
      }
    });
  }
  async function runWebDavSync(
    mode: string,
    config: { url: string; username: string; password: string; secret: string },
    silent = false,
  ) {
    const { url, username, password, secret } = config;
    if (!url || !secret || secret.length < 8) {
      if (!silent) notify("请填写 WebDAV 地址和至少 8 位本地同步密钥");
      return;
    }
    const selectedMode: WebDavSyncMode =
      mode === "upload" || mode === "download" ? mode : "smart";
    if (!webdavSync.begin(selectedMode)) return;
    try {
      const credentials = { url, username, password };
      const result = await runWebDavSyncWorkflow({
        mode: selectedMode,
        secret,
        exportSnapshot: exportLedgerSnapshot,
        encrypt: encryptSyncPayload,
        decrypt: decryptSyncPayload,
        merge: mergeSyncSnapshots,
        upload: (payload) => uploadWebDavSnapshot({ credentials, payload }),
        download: () => downloadWebDavSnapshot({ credentials }),
        restore: (snapshot) => restoreSnapshotData({ snapshot }),
      });
      if (result.mergeReport) {
        setLastMergeReport(result.mergeReport as SyncConflictReport);
        localStorage.setItem("neo-last-merge-report", JSON.stringify(result.mergeReport));
      }
      setSyncStatus(result.status);
      localStorage.setItem("neo-webdav-last-sync", String(epochNow()));
      if (result.changedLocal) router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步失败";
      setSyncStatus(`同步失败：${message}`);
      if (!silent) notify(message);
    } finally {
      webdavSync.finish();
    }
  }
  function syncWebDav(formData: FormData) {
    const mode = String(formData.get("mode"));
    const selectedMode: WebDavSyncMode =
      mode === "upload" || mode === "download" ? mode : "smart";
    selectWebdavSyncMode(selectedMode);
    const config = {
      url: String(formData.get("url") || ""),
      username: String(formData.get("username") || ""),
      password: String(formData.get("password") || ""),
      secret: String(formData.get("secret") || ""),
    };
    if (!config.url || !config.secret || config.secret.length < 8) {
      setSyncStatus(
        `已选择${selectedMode === "upload" ? "仅上传" : selectedMode === "download" ? "仅下载并覆盖本机" : "安全双向同步"}，请补全同步配置`,
      );
      notify("请填写 WebDAV 地址和至少 8 位本地同步密钥");
      return;
    }
    localStorage.setItem("neo-webdav-config", JSON.stringify(webdavConfig));
    try {
      sessionStorage.setItem("neo-webdav-password", config.password);
      sessionStorage.setItem("neo-webdav-secret", config.secret);
      setWebdavSession({ password: config.password, secret: config.secret });
    } catch {}
    startTransition(() => void runWebDavSync(mode, config));
  }
  const openEntryDialog = useCallback(() => {
    resetSplit();
    openDialog(entryRef, setEntryOpen);
  }, [resetSplit, entryRef, setEntryOpen]);
  function runParser() {
    startTransition(async () => {
      const result = await parseImportText(importText, currentLedgerId);
      setParsedPreview(result);
    });
  }
  function showAccountDialog(account: Account | null) {
    accountManager.openEditor(account);
    requestAnimationFrame(() => accountRef.current?.showModal());
  }

  function submitBudget(data: FormData) {
    startTransition(async () => {
      await updateBudget(data);
      closeDialog(budgetRef, setBudgetOpen);
    });
  }
  function submitDigitalAsset(formData: FormData) {
    startTransition(async () => {
      try {
        setAssetError("");
        const resolvedAssetType =
          assetType === "其他资产"
            ? String(formData.get("customAssetType") || "").trim()
            : assetType;
        const result = await saveAsset({
          id: editingAsset?.id,
          ledgerId: currentLedgerId,
          name: String(formData.get("name") || ""),
          assetType: resolvedAssetType,
          currency: String(formData.get("currency") || "CNY"),
          valuationMode: assetValuationMode,
          manualValue: Number(formData.get("manualValue")),
          purchasePrice: Number(formData.get("purchasePrice")),
          purchaseDate: String(formData.get("purchaseDate") || ""),
          lifespanMonths: Number(formData.get("lifespanMonths")),
          residualRate: Number(formData.get("residualRate")),
          heatLevel:
            resolvedAssetType === "游戏账号"
              ? String(formData.get("heatLevel") || "中")
              : null,
          expectedUpdatedAt: editingAsset?.updatedAt,
        });
        if (!result.ok) {
          setAssetError(result.error || (editingAsset ? "修改失败" : "新增失败"));
          return;
        }
        await reloadDigitalAssets();
        setDigitalAssetPage(1);
        const wasEditing = Boolean(editingAsset);
        closeAssetEditor();
        setToast({
          kind: "success",
          message: wasEditing ? "资产资料与估值已更新。" : "新资产已加入资产库。",
        });
      } catch (error) {
        setAssetError(error instanceof Error ? error.message : "资产保存失败，请稍后重试");
      }
    });
  }
  function saveExpenseCategory(formData: FormData) {
    startTransition(async () => {
      try {
        setCategoryError("");
        const wasEditing = Boolean(editingCategory);
        const result = await saveCategory({
          kind: "expense",
          id: editingCategory?.id,
          ledgerId: currentLedgerId,
          name: String(formData.get("name") || ""),
          icon: String(formData.get("icon") || "📦"),
          color: String(formData.get("color") || "#8f91b8"),
        });
        if (!result.ok) {
          setCategoryError(result.error || "保存失败");
          return;
        }
        await reloadCategories();
        if (!wasEditing)
          setCategoryBudgetPage(
            Math.max(1, Math.ceil((categories.length + 1) / COLLECTION_PAGE_SIZE)),
          );
        categoryManager.closeCategoryEditor();
      } catch (error) {
        setCategoryError(error instanceof Error ? error.message : "保存失败，请稍后重试");
      }
    });
  }
  function disableExpenseCategory(item: ExpenseCategory) {
    startTransition(async () => {
      try {
        setCategoryError("");
        const result = await removeCategory({
          kind: "expense",
          id: item.id,
          ledgerId: currentLedgerId,
        });
        if (!result.ok) {
          setCategoryError(result.error || "删除失败");
          return;
        }
        await reloadCategories();
        categoryManager.closeCategoryEditor();
      } catch (error) {
        setCategoryError(error instanceof Error ? error.message : "删除失败，请稍后重试");
      }
    });
  }
  function restoreExpenseCategory(item: ExpenseCategory) {
    startTransition(async () => {
      const result = await restoreCategory({
        kind: "expense",
        id: item.id,
        ledgerId: currentLedgerId,
        name: item.name,
        icon: item.icon,
        color: item.color,
      });
      if (result.ok) await reloadCategories();
      else setCategoryError(result.error || "恢复分类失败");
    });
  }
  function saveIncomeCategory(formData: FormData) {
    startTransition(async () => {
      try {
        setIncomeCategoryError("");
        const result = await saveCategory({
          kind: "income",
          id: editingIncomeCategory?.id,
          ledgerId: currentLedgerId,
          name: String(formData.get("name") || ""),
          icon: String(formData.get("icon") || "💰"),
          color: String(formData.get("color") || "#78a98c"),
        });
        if (!result.ok) {
          setIncomeCategoryError(result.error || "保存失败");
          return;
        }
        await reloadIncomeCategories();
        categoryManager.closeIncomeEditor();
      } catch (error) {
        setIncomeCategoryError(error instanceof Error ? error.message : "保存失败，请稍后重试");
      }
    });
  }
  function removeIncomeCategory(item: ExpenseCategory) {
    startTransition(async () => {
      try {
        setIncomeCategoryError("");
        const result = await removeCategory({
          kind: "income",
          id: item.id,
          ledgerId: currentLedgerId,
        });
        if (!result.ok) {
          setIncomeCategoryError(result.error || "删除失败");
          return;
        }
        await reloadIncomeCategories();
        categoryManager.closeIncomeEditor();
      } catch (error) {
        setIncomeCategoryError(error instanceof Error ? error.message : "删除失败，请稍后重试");
      }
    });
  }
  function restoreIncomeCategory(item: ExpenseCategory) {
    startTransition(async () => {
      const result = await restoreCategory({
        kind: "income",
        id: item.id,
        ledgerId: currentLedgerId,
        name: item.name,
        icon: item.icon,
        color: item.color,
      });
      if (result.ok) await reloadIncomeCategories();
      else setIncomeCategoryError(result.error || "恢复收入分类失败");
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
      try {
        setAssetError("");
        const discard = formData.get("mode") === "discard";
        const result = await liquidateAsset({
          id: liquidatingAsset.id,
          ledgerId: currentLedgerId,
          salePrice: discard ? 0 : Number(formData.get("salePrice")),
          accountId: Number(formData.get("accountId")),
          expectedUpdatedAt: liquidatingAsset.updatedAt,
        });
        if (!result.ok) {
          setAssetError(result.error || "变现失败");
          return;
        }
        liquidationRef.current?.close();
        assetManager.closeLiquidationState();
        await refreshLedger([reloadDigitalAssets]);
      } catch (error) {
        setAssetError(error instanceof Error ? error.message : "变现失败，请稍后重试");
      }
    });
  }
  function processPending(
    id: number,
    category?: Category,
    action: "confirm" | "ignore" = "confirm",
  ) {
    startTransition(async () => {
      try {
        const result = await processPendingTransaction({ id, category, action });
        if (result.ok) {
          await reloadPendingFlows();
          await reloadAccounts();
          if (action === "confirm") router.refresh();
        } else notify(result.error || "待确认流水处理失败，请稍后重试");
      } catch (error) {
        notify(error instanceof Error ? error.message : "待确认流水处理失败，请稍后重试");
      }
    });
  }
  function saveCategoryBudget(formData: FormData) {
    startTransition(async () => {
      try {
        const category = String(formData.get("category")) as Category;
        const amount = Number(formData.get("amount"));
        const result = await saveCategoryBudgetRequest({ ledgerId: currentLedgerId, category, amount });
        if (result.ok)
          setCategoryBudgetList((rows) =>
            rows.map((row) =>
              row.category === category
                ? { ...row, amount: Math.round(amount * 100) }
                : row,
            ),
          );
        else notify(result.error || "预算保存失败，请稍后重试");
      } catch (error) {
        notify(error instanceof Error ? error.message : "预算保存失败，请稍后重试");
      }
    });
  }
  function submitSubscription(formData: FormData) {
    setSubscriptionError("");
    startTransition(async () => {
      try {
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
        const { response, data } = await saveSubscription(body);
        const result = data ?? {};
        if (response.ok) {
          const wasEditing = Boolean(editingSubscription);
          await reloadSubscriptions();
          if (!wasEditing) setSubscriptionPage(1);
          closeDialog(subscriptionRef, setSubscriptionOpen);
          closeSubscriptionEditor();
          if (!wasEditing) resetSubscriptionCategoryDraft();
          setToast({
            kind: "success",
            message: editingSubscription
              ? "续费信息已经更新。"
              : "新的续费项目已经添加。",
          });
        } else {
          setSubscriptionError(result.error ?? "保存失败");
        }
      } catch (error) {
        setSubscriptionError(error instanceof Error ? error.message : "保存失败，请稍后重试");
      }
    });
  }
  function removeSubscription(id: number) {
    startTransition(async () => {
      try {
        const { response } = await removeSubscriptionRequest({
          id,
          ledgerId: currentLedgerId,
        });
        if (response.ok)
          setSubscriptionList((rows) => rows.filter((row) => row.id !== id));
        else setSubscriptionError("删除失败，请稍后重试");
      } catch (error) {
        setSubscriptionError(error instanceof Error ? error.message : "删除失败，请稍后重试");
      }
    });
  }
  function addSubscriptionCategory() {
    const name = subscriptionCategoryDraft.name.trim().slice(0, 12);
    if (!name) {
      setSubscriptionCategoryError("请输入分类名称");
      return;
    }
    startTransition(async () => {
      try {
        setSubscriptionCategoryError("");
        const result = await saveCategory({
          kind: "expense",
          ledgerId: currentLedgerId,
          name,
          icon: subscriptionCategoryDraft.icon,
          color: subscriptionCategoryDraft.color,
        });
        if (!result.ok) {
          setSubscriptionCategoryError(result.error || "添加失败");
          return;
        }
        await reloadCategories();
        setSubscriptionCategory(name);
        resetSubscriptionCategoryDraft();
      } catch (error) {
        setSubscriptionCategoryError(error instanceof Error ? error.message : "添加失败，请稍后重试");
      }
    });
  }
  async function removeSubscriptionCategory(item: ExpenseCategory) {
    const agreed = await confirmAsk({
      title: `删除分类「${item.name}」`,
      message: "已经记过的历史账单会保留，只是不再出现在选项里。",
      tone: "danger",
      confirmText: "删除",
    });
    if (!agreed) return;
    startTransition(async () => {
      try {
        setSubscriptionCategoryError("");
        const result = await removeCategory({
          kind: "expense",
          id: item.id,
          ledgerId: currentLedgerId,
        });
        if (!result.ok) {
          setSubscriptionCategoryError(result.error || "删除失败");
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
      } catch (error) {
        setSubscriptionCategoryError(error instanceof Error ? error.message : "删除失败，请稍后重试");
      }
    });
  }
  function submitInstallment(formData: FormData) {
    startTransition(async () => {
      try {
        const { response, data } = await createInstallment({
          ledgerId: currentLedgerId,
          name: formData.get("name"),
          totalAmount: Number(formData.get("totalAmount")),
          periods: Number(formData.get("periods")),
          feeAmount: Number(formData.get("feeAmount")),
          accountId: Number(formData.get("accountId")),
          paymentAccountId: Number(formData.get("paymentAccountId")),
          startMonth: formData.get("startMonth"),
          chargeDay: Number(formData.get("chargeDay")),
        });
        if (response.ok) window.location.reload();
        else notify(data?.error ?? "创建失败");
      } catch (error) {
        notify(error instanceof Error ? error.message : "创建失败，请稍后重试");
      }
    });
  }
  async function removeInstallment(item: Installment) {
    const agreed = await confirmAsk({
      title: `撤销分期「${item.name}」`,
      message: "这会删除尚未开始还款的分期，并把建立分期时的负债入账撤销。",
      tone: "danger",
      confirmText: "撤销并删除",
    });
    if (!agreed) return;
    startTransition(async () => {
      try {
        const { response, data } = await removeInstallmentRequest({ id: item.id, expectedUpdatedAt: item.updatedAt });
        if (response.ok) {
          await refreshLedger();
          notify("分期已撤销，账户余额已恢复。", "success");
        } else notify(data?.error ?? "分期撤销失败");
      } catch (error) {
        notify(error instanceof Error ? error.message : "分期撤销失败，请稍后重试");
      }
    });
  }
  async function restoreBackup(file: File | undefined) {
    if (!file) return;
    startTransition(async () => {
      try {
        const result = await runRestoreBackupWorkflow({
          file,
          confirm: async (details) =>
            Boolean(await confirmAsk({
              title: "确认恢复备份",
              message: details.message,
              tone: "danger",
              confirmText: "覆盖并恢复",
            })),
        });
        if (result.cancelled) return;
        const { response, data } = result;
        if (response.ok) {
          try {
            if (data?.summary)
              sessionStorage.setItem(restoreResultStorageKey, JSON.stringify(data.summary));
          } catch {
            // The reload still completes if session storage is unavailable.
          }
          window.location.reload();
        } else notify(data?.error ?? "恢复失败");
      } catch (error) {
        notify(error instanceof Error ? error.message : "恢复失败，请稍后重试");
      }
    });
  }
  async function restoreSavedSnapshot(snapshot: RestoreSnapshot) {
    startTransition(async () => {
      try {
        const result = await runRestoreSnapshotWorkflow({
          snapshotId: snapshot.id,
          confirm: async (details) =>
            Boolean(await confirmAsk({
              title: "确认回到恢复前版本",
              message: `${details.message} 系统会先自动保存当前快照。`,
              tone: "danger",
              confirmText: "回滚",
            })),
        });
        if (result.cancelled) return;
        const { response, data } = result;
        if (response.ok) {
          try {
            if (data?.summary)
              sessionStorage.setItem(restoreResultStorageKey, JSON.stringify(data.summary));
          } catch {
            // The reload still completes if session storage is unavailable.
          }
          window.location.reload();
        } else notify(data?.error ?? "回滚失败");
      } catch (error) {
        notify(error instanceof Error ? error.message : "回滚失败，请稍后重试");
      }
    });
  }
  function parseBillFiles(fileList: FileList | File[] | null | undefined) {
    const files = fileList ? Array.from(fileList) : [];
    if (!files.length) return;
    billImport.begin();
    startTransition(async () => {
      try {
        const result = await runBillImportWorkflow<ParsedStatementItem>({
          files,
          ledgerId: currentLedgerId,
          parseFiles: parseStatementFiles,
          preview: async (ledgerId, items) =>
            previewBillImport<ParsedStatementItem, ImportedBill>({ ledgerId, items }),
          partition: (items) =>
            partitionStatementImports(items) as {
              automatic: ParsedStatementItem[];
              review: ParsedStatementItem[];
            },
          submitRows: (rows) => submitBillRows(rows as ImportedBill[]),
          reloadAccounts,
          onStatus: setBillImportStatus,
        });
        if (result.kind === "empty" || result.kind === "preview-error") {
          setBillImportError(result.error);
          return;
        }
        setBillImportItems(result.kind === "automatic-failed" ? result.items as ImportedBill[] : result.reviewItems as ImportedBill[]);
        setBillImportSummary(result.summary);
        if (result.kind === "automatic-failed") return;
        setBillImportError(result.failuresMessage);
        if (result.automaticRows.length) {
          setToast({
            kind: "success",
            message: result.reviewItems.length
              ? `已自动识别账户并导入 ${result.autoImported} 笔，另有 ${result.reviewItems.length} 笔需要处理。`
              : `已自动识别账户并导入 ${result.autoImported} 笔流水。`,
          });
          if (result.kind === "ready" && !result.reviewItems.length)
            await refreshLedger();
        }
      } catch (error) {
        setBillImportError(
          error instanceof Error ? error.message : "无法读取这个账单文件",
        );
      } finally {
        setBillImportStatus("");
      }
    });
  }
  function assignBillAccount(accountKey: string, nextAccountId: number) {
    const account = accountList.find((item) => item.id === nextAccountId);
    const nextRows = billImportItems.map((row) =>
        statementAccountKey(row) === accountKey
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
  async function createBillAccountAndImport(accountKey: string) {
    const rows = billImportItems.filter(
      (item) => statementAccountKey(item) === accountKey,
    );
    const representative = rows[0];
    if (!representative) return;
    const suggestion = suggestStatementAccount(
      representative.paymentMethod,
      representative.sourceName,
      representative.currency,
    ) as {
      name: string;
      type: "资产" | "负债";
      currency: Currency;
    };
    setBillAccountActionKey(accountKey);
    setBillImportError("");
    try {
      const existing = accountList.find(
        (account) =>
          account.name === suggestion.name &&
          account.type === suggestion.type &&
          account.currency === suggestion.currency,
      );
      const result = await runBillImportAccountWorkflow({
        ledgerId: currentLedgerId,
        rows,
        suggestion,
        existingAccountId: existing?.id,
        createAccount: createBillImportAccount,
        submitRows: submitBillRows,
        reloadAccounts,
      });
      if (result.kind === "import-failed") {
        setBillImportItems((current) =>
          current.map((item) =>
            statementAccountKey(item) === accountKey
              ? {
                  ...item,
                  accountId: result.accountId,
                  accountName: result.accountName,
                }
              : item,
          ),
        );
        setBillManualAccountKeys((current) =>
          current.includes(accountKey) ? current : [...current, accountKey],
        );
        return;
      }
      const remaining = billImportItems.filter(
        (item) => statementAccountKey(item) !== accountKey,
      );
      setBillImportItems(remaining);
      setBillImportSummary((current) =>
        current
          ? {
              ...current,
              pending: remaining.length,
              unmapped: remaining.filter((item) => item.accountId <= 0).length,
              autoImported:
                current.autoImported + result.imported,
            }
          : current,
      );
      setToast({
        kind: "success",
        message: `已新建“${suggestion.name}”并导入 ${result.imported} 笔流水。`,
      });
      if (!remaining.length) await refreshLedger();
    } catch (error) {
      setBillImportError(
        error instanceof Error ? error.message : "新建账户并导入失败",
      );
    } finally {
      setBillAccountActionKey("");
    }
  }
  function confirmBillImport() {
    startTransition(async () => {
      const result = await confirmBillImportWorkflow({
        rows: billImportItems,
        submitRows: submitBillRows,
        refreshLedger,
      });
      if (result.kind === "unmapped") {
        setBillImportError(result.error);
        return;
      }
      if (result.kind === "failed") return;
      if (result.kind === "imported") {
        setToast({
          kind: "success",
          message: `已导入 ${result.imported} 笔流水${result.duplicates ? `，跳过 ${result.duplicates} 笔重复项` : ""}。`,
        });
      }
    });
  }
  async function cleanBadBillImports() {
    const agreed = await confirmAsk({
      title: "清理错误账单",
      message: "将删除命中声明/法律条款黑名单的错误账单，并自动恢复受影响账户余额。",
      tone: "danger",
      confirmText: "清理",
    });
    if (!agreed) return;
    startTransition(async () => {
      try {
        const { response, data } = await cleanBadBillImportsRequest({
          ledgerId: currentLedgerId,
        });
        if (response.ok) {
          notify(`已清理 ${data?.deleted ?? 0} 笔声明账单，并修复账户余额。`, "success");
          await refreshLedger();
        } else setBillImportError(data?.error ?? "清理失败");
      } catch (error) {
        setBillImportError(
          error instanceof Error ? error.message : "清理失败，请稍后重试",
        );
      }
    });
  }
  async function createLedger() {
    const choice = await confirmAsk({
      title: "新建账本",
      message: "例如：旅游专项账本 / 差旅报销账本 / 追星二次元账本",
      confirmText: "创建",
      input: {
        label: "账本名称",
        defaultValue: "旅游专项账本",
        placeholder: "旅游专项账本",
      },
    });
    if (!choice) return;
    const icon = choice.includes("旅游")
      ? "✈️"
      : choice.includes("差旅")
        ? "💼"
        : "🌟";
    startTransition(async () => {
      try {
        const result = await createLedgerRequest({ name: choice, icon });
        if (result.ok && result.id) router.push(`/?ledger=${result.id}`);
        else notify(result.error || "新建账本失败，请稍后重试。");
      } catch (error) {
        notify(error instanceof Error ? error.message : "新建账本失败，请稍后重试。");
      }
    });
  }
  async function deleteLedger() {
    const ledger = ledgers.find((item) => item.id === currentLedgerId);
    if (!ledger) return;
    if (ledgers.length <= 1) {
      notify("至少需要保留一个账本。");
      return;
    }
    const agreed = await confirmAsk({
      title: `删除账本“${ledger.name}”`,
      message:
        "其中的账单、账户、预算和分类等数据都会永久删除，此操作无法撤销。",
      tone: "danger",
      confirmText: "永久删除",
    });
    if (!agreed) return;
    startTransition(async () => {
      try {
        const result = await deleteLedgerRequest(currentLedgerId, ledger.updatedAt);
        if (result.ok) {
          const next = ledgers.find((item) => item.id !== currentLedgerId);
          window.location.href = next ? `/?ledger=${next.id}` : "/";
        } else {
          notify(result.error || "删除账本失败，请稍后重试。");
        }
      } catch (error) {
        notify(error instanceof Error ? error.message : "删除账本失败，请稍后重试。");
      }
    });
  }
  function submitGoal(formData: FormData) {
    setGoalError("");
    startTransition(async () => {
      try {
        const { response, data } = await createSavingsGoal({
          ledgerId: currentLedgerId,
          name: formData.get("name"),
          targetAmount: Number(formData.get("targetAmount")),
          deadline: formData.get("deadline"),
          icon: formData.get("icon"),
        });
        const result = data ?? {};
        if (response.ok) {
          await reloadGoals();
          setGoalPage(
            Math.max(1, Math.ceil((goalList.length + 1) / COLLECTION_PAGE_SIZE)),
          );
          closeDialog(goalRef, setGoalOpen);
          setToast({ kind: "success", message: "新心愿已经放进储蓄罐。" });
        } else {
          setGoalError(result.error ?? "创建失败");
        }
      } catch (error) {
        setGoalError(error instanceof Error ? error.message : "创建失败，请稍后重试");
      }
    });
  }
  function contributeGoal(formData: FormData) {
    if (!savingGoal) return;
    setGoalError("");
    startTransition(async () => {
      try {
        const { response, data } = await contributeSavingsGoal({
          id: savingGoal.id,
          accountId: Number(formData.get("accountId")),
          amount: Number(formData.get("amount")),
        });
        const result = data ?? {};
        if (response.ok) {
          await Promise.all([reloadGoals(), reloadAccounts()]);
          closeDialog(goalRef, setGoalOpen);
          closeSavingsGoalEditor();
          setToast({
            kind: "success",
            message: result.completed
              ? "目标金额已存满，心愿达成。"
              : `已存入 ${money.format((result.appliedAmount ?? 0) / 100)}。`,
          });
        } else {
          setGoalError(result.error ?? "存入失败");
        }
      } catch (error) {
        setGoalError(error instanceof Error ? error.message : "存入失败，请稍后重试");
      }
    });
  }
  async function deleteGoal(formData: FormData) {
    if (!savingGoal) return;
    const hasSavings = savingGoal.savedAmount > 0;
    const agreed = await confirmAsk({
      title: `删除「${savingGoal.name}」`,
      message: hasSavings
        ? `已存入的 ${money.format(savingGoal.savedAmount / 100)} 会退回所选账户。`
        : "这个储蓄目标会被删除。",
      tone: "danger",
      confirmText: "删除",
    });
    if (!agreed) return;
    setGoalError("");
    startTransition(async () => {
      try {
        const { response, data } = await deleteSavingsGoal({
          id: savingGoal.id,
          accountId: Number(formData.get("accountId")),
          expectedUpdatedAt: savingGoal.updatedAt,
        });
        const result = data ?? {};
        if (response.ok) {
          await Promise.all([reloadGoals(), reloadAccounts()]);
          closeDialog(goalRef, setGoalOpen);
          closeSavingsGoalEditor();
          setToast({
            kind: "success",
            message: (result.refundedAmount ?? 0) > 0
              ? `心愿已删除，${money.format((result.refundedAmount ?? 0) / 100)} 已退回账户。`
              : "心愿已删除。",
          });
        } else {
          setGoalError(result.error ?? "删除失败");
        }
      } catch (error) {
        setGoalError(error instanceof Error ? error.message : "删除失败，请稍后重试");
      }
    });
  }
  function chooseTheme(next: ThemeName) {
    setTheme(next);
    startTransition(async () => {
      try {
        const result = await saveTheme(next);
        if (!result.ok) notify(result.error || "主题保存失败，请稍后重试");
      } catch (error) {
        notify(error instanceof Error ? error.message : "主题保存失败，请稍后重试");
      }
    });
  }
  async function configureLock(formData: FormData) {
    const enabled = formData.get("enabled") === "on",
      nextPin = String(formData.get("pin") || "");
    const result = await privacyLock.configure(enabled, nextPin);
    if (result.ok) closeDialog(dataRef, setDataOpen);
    else notify(result.error);
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
  async function addMember() {
    const name = await confirmAsk({
      title: "添加分账搭子",
      message: "添加后可以在记账时选择由谁付款、与谁分摊。",
      confirmText: "添加",
      input: {
        label: "搭子名字",
        defaultValue: memberList.length === 1 ? "对象" : "室友",
      },
    });
    if (!name) return;
    startTransition(async () => {
      try {
        const { response, data } = await createMember<Member>({
          ledgerId: currentLedgerId,
          name,
          icon: name.includes("对象") ? "💞" : "🧑‍🤝‍🧑",
        });
        if (response.ok && data?.id) {
          setMemberList((items) => [...items, data]);
          const partnerCount = memberList.filter((item) => !item.isMe).length + 1;
          setSettlementPage(
            Math.max(1, Math.ceil(partnerCount / COLLECTION_PAGE_SIZE)),
          );
          setSplitMemberId(data.id);
        } else notify(data?.error ?? "添加成员失败，请稍后重试。");
      } catch (error) {
        notify(error instanceof Error ? error.message : "添加成员失败，请稍后重试。");
      }
    });
  }
  async function settle(memberId: number, balance: number) {
    const agreed = await confirmAsk({
      title: "人情平账",
      message: "会生成一笔平账流水，并把当前债务清零。",
      confirmText: "平账",
    });
    if (!agreed) return;
    startTransition(async () => {
      try {
        const result = await settleMember({
          ledgerId: currentLedgerId,
          memberId,
          amount: Math.abs(balance),
          direction: balance > 0 ? "owesMe" : "iOwe",
        });
        if (result.ok) await refreshLedger();
        else notify(result.error || "平账失败，请稍后重试。");
      } catch (error) {
        notify(error instanceof Error ? error.message : "平账失败，请稍后重试。");
      }
    });
  }

  const categorySpend = Object.fromEntries(
    categories.map((name) => [
      name,
      serverSummary?.dashboard.categorySpend.find((item) => item.name === name)?.amount ??
        (transactionsTruncated ? 0 : transactions
          .filter(
            (item) =>
              item.type === "支出" &&
              item.category === name &&
              (!todayKey || item.occurredAt.startsWith(todayKey.slice(0, 7))),
          )
          .reduce((sum, item) => sum + item.amount * exchangeRates[item.currency], 0)),
    ]),
  ) as Record<Category, number>;
  const impulseDays = new Set(
    serverSummary?.dashboard.impulseDates ?? (transactionsTruncated ? [] : transactions
      .filter((item) => item.type === "支出" && item.mood === "冲动")
      .map((item) => item.occurredAt.slice(0, 10))),
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
  const ledgerEntryActions = useLedgerEntryActions<ParsedEntry>({
    ledgerId: currentLedgerId,
    entryType,
    accountId,
    mood,
    category,
    incomeCategory,
    splitMode,
    splitMemberId,
    mySharePercent,
    nudgeActive,
    reflection,
    reflectionPhrase,
    parsedPreview,
    startTransition,
    addTransaction,
    offlinePut,
    refreshOfflineCount,
    createOfflineId: createClientId,
    isOnline: () => navigator.onLine,
    closeEntry: () => closeDialog(entryRef, setEntryOpen),
    resetImport,
    resetSplit,
    notify,
  });
  const { submitEntry, confirmParsed } = ledgerEntryActions;
  const selectedIncomeCategory = incomeCategoryList.find(
    (item) => item.name === incomeCategory,
  );

  const selectModule = useCallback((nextTab: typeof tab) => {
    setTab(nextTab);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [setTab]);

  useAppKeyboardShortcuts({ openEntryDialog, selectModule });

  const hasUnreadNotice =
    pendingFlows.length > 0 || systemNotices.some((item) => !item.read);
  const currentLedger = ledgers.find((item) => item.id === currentLedgerId);

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
      {ask && (
        // 必须用 <dialog>：其他弹窗用 showModal() 渲染在浏览器顶层，
        // 普通 div 无论 z-index 多大都会被压在下面。
        <dialog
          className="ask-dialog"
          ref={askRef}
          onCancel={(event) => {
            event.preventDefault();
            settleAsk(null);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) settleAsk(null);
          }}
        >
          <div
            className={`ask-panel ${ask.tone}`}
            role="alertdialog"
            aria-label={ask.title}
          >
            <strong>{ask.title}</strong>
            <p>{ask.message}</p>
            {ask.input && (
              <label className="ask-field">
                <span>{ask.input.label}</span>
                <input
                  autoFocus
                  value={askValue}
                  placeholder={ask.input.placeholder}
                  onChange={(event) => setAskValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && askValue.trim())
                      settleAsk(askValue.trim());
                  }}
                />
              </label>
            )}
            <div className="ask-actions">
              <button type="button" onClick={() => settleAsk(null)}>
                取消
              </button>
              <button
                type="button"
                className="ask-primary"
                autoFocus={!ask.input}
                disabled={Boolean(ask.input) && !askValue.trim()}
                onClick={() => settleAsk(ask.input ? askValue.trim() : "ok")}
              >
                {ask.confirmText}
              </button>
            </div>
          </div>
        </dialog>
      )}
      {locked && (
        <div className="privacy-wall">
          <div className="lock-panel">
            <div className="lock-orb">◉</div>
            <p className="eyebrow">PRIVACY GUARD</p>
            <h2>屏幕隐私锁已开启</h2>
            <p>这是防窥屏遮罩，不等于账号认证、磁盘加密或端到端加密。</p>
            <input
              value={privacyLock.pin}
              onChange={(event) =>
                privacyLock.setPin(event.target.value)
              }
              onKeyDown={(event) =>
                event.key === "Enter" && privacyLock.pin.length === 4 && void privacyLock.unlock()
              }
              inputMode="numeric"
              type="password"
              placeholder="••••"
              autoFocus
            />
            <button onClick={() => void privacyLock.unlock()} disabled={privacyLock.pin.length !== 4 || privacyLock.pending}>
              解锁账本
            </button>
            {privacyLock.error && <span>{privacyLock.error}</span>}
          </div>
        </div>
      )}
      <section
        className={`app-frame finance-frame ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
        data-module={tab}
      >
        {/* Tablet Navigation Rail (visible on tablet landscape/portrait 641px ~ 1180px) */}
        <TabletRailNav
          currentTab={tab}
          onSelectTab={selectModule}
          onOpenEntry={openEntryDialog}
          currentLedger={currentLedger}
          onOpenLedgerMenu={() => openDialog(ledgerMenuRef, setLedgerMenuOpen)}
          onOpenDataCenter={() => openDialog(dataRef, setDataOpen)}
          onOpenNotifications={() => {
            void requestDesktopNotifications();
            openDialog(noticeRef, setNoticeOpen);
            markNoticesRead();
          }}
          onOpenAesthetic={() => openDialog(aestheticRef, setAestheticOpen)}
          onOpenAuth={() => openDialog(authRef, setAuthOpen)}
          hasUnreadNotice={hasUnreadNotice}
          currentUser={currentAuthUser}
        />

        {/* Desktop Sidebar (visible on desktop viewports >= 1181px) */}
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
              {currentLedger?.icon ?? "📚"}
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
                void requestDesktopNotifications();
                openDialog(noticeRef, setNoticeOpen);
                markNoticesRead();
              }}
            >
              🔔
              {hasUnreadNotice && (
                <i className="alert-dot" />
              )}
            </button>
            <button
              aria-label="换肤中心"
              title="换肤中心"
              onClick={() => openDialog(aestheticRef, setAestheticOpen)}
            >
              🎨
            </button>
          </div>
          <nav className="module-nav" aria-label="财务模块">
            <button
              className={tab === "dashboard" ? "active" : ""}
              onClick={() => selectModule("dashboard")}
              title="主界面 (Cmd+1)"
            >
              <span aria-hidden="true">🏠</span><b>主界面</b>
            </button>
            <button
              className={tab === "assets" ? "active" : ""}
              onClick={() => selectModule("assets")}
              title="个人资产 (Cmd+2)"
            >
              <span aria-hidden="true">💎</span><b>个人资产</b>
            </button>
            <button
              className={tab === "bills" ? "active" : ""}
              onClick={() => selectModule("bills")}
              title="个人账单 (Cmd+3)"
            >
              <span aria-hidden="true">🧾</span><b>个人账单</b>
            </button>
            <button
              className={tab === "planning" ? "active" : ""}
              onClick={() => selectModule("planning")}
              title="管理规划 (Cmd+4)"
            >
              <span aria-hidden="true">🗓️</span><b>管理规划</b>
            </button>
            <button
              className={tab === "analytics" ? "active" : ""}
              onClick={() => selectModule("analytics")}
              title="统计分析 (Cmd+5)"
            >
              <span aria-hidden="true">📊</span><b>统计分析</b>
            </button>
          </nav>
          <button
            className="floating-entry-button"
            onClick={openEntryDialog}
            aria-label="记一笔"
            title="记一笔 (Cmd+N)"
          >
            <span>＋</span>
            <b>记一笔</b>
          </button>
          <button
            type="button"
            className="sidebar-profile"
            onClick={() => openDialog(authRef, setAuthOpen)}
            aria-label={
              currentAuthUser
                ? `当前登录账号 ${currentAuthUser.username}`
                : "登录账号"
            }
            title={
              currentAuthUser
                ? `当前登录账号 ${currentAuthUser.username}`
                : "登录账号"
            }
          >
            <div className="avatar">
              {currentAuthUser?.avatarUrl ? (
                <Image
                  src={currentAuthUser.avatarUrl}
                  alt=""
                  width={34}
                  height={34}
                  unoptimized
                />
              ) : (
                currentAuthUser?.displayName.slice(0, 1).toUpperCase() ?? "☺"
              )}
            </div>
            <div>
              <strong>
                {currentAuthUser ? currentAuthUser.username : "登录账号"}
              </strong>
            </div>
          </button>
        </header>

        {/* Mobile Top Header (visible on mobile < 640px) */}
        <MobileHeader
          currentLedger={currentLedger}
          onOpenLedgerMenu={() => openDialog(ledgerMenuRef, setLedgerMenuOpen)}
          onOpenDataCenter={() => openDialog(dataRef, setDataOpen)}
          onOpenNotifications={() => {
            void requestDesktopNotifications();
            openDialog(noticeRef, setNoticeOpen);
            markNoticesRead();
          }}
          onOpenAesthetic={() => openDialog(aestheticRef, setAestheticOpen)}
          onOpenAuth={() => openDialog(authRef, setAuthOpen)}
          hasUnreadNotifications={hasUnreadNotice}
          currentUser={currentAuthUser}
          isOnline={isOnline}
        />

        <div className="finance-content">
        <div className="tablet-master-detail-shell">
        <div className="tablet-master-pane">
        {(installPrompt || offlineCount > 0) && (
          <div className="pwa-banner">
            <span>
              {offlineCount > 0
                ? `☁️ ${offlineCount} 笔离线账单等待同步`
                : "📲 把 NeoLedger 装进主屏幕，像原生 App 一样使用"}
            </span>
            {installPrompt && (
              <button onClick={() => void installPwa()}>
                添加到主屏幕
              </button>
            )}
            {offlineCount > 0 && isOnline && (
              <button onClick={() => void syncOfflineNow()}>
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
            {!onboardingDismissed && transactionTotal === 0 && (
              <OnboardingCard
                accountCount={accountList.length}
                hasTransactions={transactionTotal > 0}
                onOpenEntry={openEntryDialog}
                onOpenImport={() => selectModule("bills")}
                onDismiss={dismissOnboarding}
              />
            )}
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
              <FinanceOverviewSection
                rank={rank}
                assetTotal={assetTotal}
                liabilityTotal={liabilityTotal}
                financialAssetTotal={financialAssetTotal}
                digitalAssetTotal={digitalAssetTotal}
                realNetWorthOneYear={realNetWorthOneYear}
                inflationRate={inflationRate}
                budget={budget}
                monthExpense={monthExpense}
                pending={pending}
                formatMoney={(amount) => money.format(amount)}
                onOpenBadges={() => {
                  setBadgeFocusCode(null);
                  openDialog(badgeRef, setBadgeOpen);
                }}
                onOpenBudget={() => openDialog(budgetRef, setBudgetOpen)}
                onSaveInflation={saveInflation}
              />
              <SubscriptionSection
                sectionRef={subscriptionListRef}
                rows={subscriptionPageData.rows}
                totalRows={subscriptionPageData.totalRows}
                page={subscriptionPageData.page}
                totalPages={subscriptionPageData.totalPages}
                todayKey={todayKey}
                categoryEmoji={(category) => categoryMeta[category].emoji}
                onAdd={() => {
                  openSubscriptionEditor(null, categories[0] ?? "");
                  openDialog(subscriptionRef, setSubscriptionOpen);
                }}
                onEdit={(item: SubscriptionListItem) => {
                  openSubscriptionEditor(item, item.category);
                  openDialog(subscriptionRef, setSubscriptionOpen);
                }}
                onRemove={removeSubscription}
                onPageChange={changeSubscriptionPage}
              />
            </section>

            <section className="neo-ai-hub module-dashboard">
              <div className="ai-hub-head">
                <div>
                  <p className="eyebrow">PRIVATE RAG FINANCE COPILOT</p>
                  <h2>💬 NeoAI 财富智囊</h2>
                  <span>
                    只读取聚合财务摘要 · 默认不发送到第三方
                  </span>
                  <label className="ai-consent-toggle">
                    <input type="checkbox" checked={aiExternalConsent} onChange={(event) => setAiExternalConsent(event.target.checked)} />
                    <span>允许发送到管理员配置的 Ollama（仅本次浏览会话）</span>
                  </label>
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
                {chatPending && chatMessages.at(-1)?.role === "user" && (
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
                <button disabled={chatPending || !chatInput.trim()}>发送 ↗</button>
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

            <AccountSection
              accounts={accountList}
              warnings={warnings.map((item) => ({ accountId: item.account.id, days: item.days }))}
              exchangeRates={exchangeRates}
              formatCurrency={formatCurrency}
              formatMoney={(amount) => money.format(amount)}
              onTransfer={() => {
                setTransferError("");
                openDialog(transferRef, setTransferOpen);
              }}
              onAddAccount={() => showAccountDialog(null)}
              onEditAccount={showAccountDialog}
            />

            <DigitalAssetSection
              sectionRef={digitalAssetListRef}
              assets={digitalAssetList}
              rows={digitalAssetPageData.rows}
              totalValue={digitalAssetTotal}
              page={digitalAssetPageData.page}
              totalPages={digitalAssetPageData.totalPages}
              totalRows={digitalAssetPageData.totalRows}
              formatCurrency={formatCurrency}
              formatMoney={(amount) => money.format(amount)}
              onAdd={() => showAssetEditor()}
              onEdit={showAssetEditor}
              onLiquidate={showLiquidation}
              onPageChange={changeDigitalAssetPage}
            />

            <SettlementSection
              sectionRef={settlementListRef}
              currentMembers={memberList.filter((item) => item.isMe)}
              pageMembers={settlementPageData.rows}
              settlements={visibleSettlements}
              page={settlementPageData.page}
              totalPages={settlementPageData.totalPages}
              totalRows={settlementPageData.totalRows}
              pending={pending}
              onAdd={addMember}
              onSettle={(memberId, balance) => void settle(memberId, balance)}
              onPageChange={changeSettlementPage}
            />

            <SavingsGoalSection
              sectionRef={goalListRef}
              rows={goalPageData.rows}
              totalRows={goalPageData.totalRows}
              page={goalPageData.page}
              totalPages={goalPageData.totalPages}
              todayKey={todayKey}
              onAdd={() => {
                openSavingsGoalEditor(null);
                openDialog(goalRef, setGoalOpen);
              }}
              onManage={(goal: SavingsGoalListItem) => {
                openSavingsGoalEditor(goal);
                openDialog(goalRef, setGoalOpen);
              }}
              onPageChange={changeGoalPage}
            />

            <InstallmentSection
              sectionRef={installmentListRef}
              rows={installmentPageData.rows}
              totalRows={installmentPageData.totalRows}
              page={installmentPageData.page}
              totalPages={installmentPageData.totalPages}
              onAdd={() => openDialog(installmentRef, setInstallmentOpen)}
              onDelete={removeInstallment}
              onPageChange={changeInstallmentPage}
            />

            <CategoryBudgetSection
              sectionRef={categoryBudgetListRef}
              categories={categoryBudgetPageData.rows}
              budgets={categoryBudgetList}
              spend={categorySpend}
              categoryEmoji={(name) => categoryMeta[name].emoji}
              configuredCategoryNames={categoryList.map((item) => item.name)}
              page={categoryBudgetPageData.page}
              totalPages={categoryBudgetPageData.totalPages}
              totalRows={categoryBudgetPageData.totalRows}
              onCustomize={() => {
                setEditingCategory(null);
                setCategoryError("");
                openDialog(categoryManagerRef, setCategoryManagerOpen);
              }}
              onEditCategory={(name) => {
                const configuredCategory = categoryList.find((item) => item.name === name);
                if (!configuredCategory) return;
                setEditingCategory(configuredCategory);
                setCategoryError("");
                openDialog(categoryManagerRef, setCategoryManagerOpen);
              }}
              onSave={saveCategoryBudget}
              onPageChange={changeCategoryBudgetPage}
            />

            <BillSection
              sectionRef={billListRef}
              billPage={billPage}
              billResults={billResults}
              totalTransactions={transactionTotal}
              billQuery={billQuery}
              onBillQueryChange={setBillQuery}
              billRange={billRange}
              onBillRangeChange={setBillRange}
              billAnchorDate={billAnchorDate}
              onBillAnchorChange={setBillAnchorDate}
              billAnchorKey={billAnchorKey}
              todayKey={todayKey}
              billPeriodYears={billPeriodYears}
              billStartDate={billStartDate}
              billEndDate={billEndDate}
              onBillStartDateChange={setBillStartDate}
              onBillEndDateChange={setBillEndDate}
              onResetFilters={resetBillFilters}
              reconciliation={reconciliation}
              accountList={accountList}
              categoryMeta={categoryMeta}
              incomeMeta={incomeMeta}
              exchangeRates={exchangeRates}
              dateLabels={dateLabels}
              pending={pending}
              loading={Boolean(transactionsTruncated && largeBillQuery?.loading)}
              error={transactionsTruncated ? (largeBillQuery?.error ?? null) : null}
              onEdit={(row: BillSectionRow) => void editBillRow(row)}
              onDelete={requestDeleteTransaction}
              optimisticDeletedIds={optimisticDeletedTransactionIds}
              onPageChange={changeBillPage}
              onOpenEntry={openEntryDialog}
            />
          </>
        )}
        {(tab === "planning" || tab === "analytics") && (
          <AnalyticsSection
            dimension={dimension}
            analysis={analysis}
            insights={insights}
            forecast={forecast}
            fireMonthlyExpense={fireConfig.monthlyExpense}
            fireAnnualReturnBps={fireConfig.annualReturnBps}
            pending={pending}
            stressEvents={stressEvents}
            lineCanvas={lineCanvas}
            pieCanvas={pieCanvas}
            moodCanvas={moodCanvas}
            forecastCanvas={forecastCanvas}
            formatMoney={(amount) => money.format(amount)}
            onDimensionChange={setDimension}
            onSaveFire={saveFire}
            onStressEventsChange={setStressEvents}
          />
        )}
        </div>

        <TabletContextPanel
          currentTab={tab}
          currentLedger={currentLedger}
          transactionTotal={transactionTotal}
          accountCount={accountList.length}
          pendingCount={pendingFlows.length}
          offlineCount={offlineCount}
          isOnline={isOnline}
          hasUnreadNotice={hasUnreadNotice}
          onOpenEntry={openEntryDialog}
          onOpenDataCenter={() => openDialog(dataRef, setDataOpen)}
          onOpenNotifications={() => {
            void requestDesktopNotifications();
            openDialog(noticeRef, setNoticeOpen);
            markNoticesRead();
          }}
        />
        </div>
        </div>

      </section>

      {transactionEditOpen && transactionEdit && (
        <TransactionEditDialog
          dialogRef={transactionEditRef}
          draft={transactionEdit}
          accounts={accountList}
          categories={categories}
          incomeCategories={activeIncomeCategories}
          moods={moods}
          error={transactionEditError}
          pending={pending}
          formatDateTime={toLocalDateTimeInput}
          onClose={closeTransactionEditor}
          onSubmit={submitTransactionEdit}
          onTypeChange={(type) => setTransactionEdit((current) => current ? { ...current, type } : current)}
          onAccountChange={(accountId) => setTransactionEdit((current) => current ? { ...current, accountId } : current)}
          onCategoryChange={(category) => setTransactionEdit((current) => current ? { ...current, category } : current)}
          onMoodChange={(mood) => setTransactionEdit((current) => current ? { ...current, mood: mood as Mood } : current)}
          onIncomeCategoryChange={(incomeCategory) => setTransactionEdit((current) => current ? { ...current, incomeCategory } : current)}
        />
      )}
      <TransactionEntryDialog
        open={entryOpen}
        dialogRef={entryRef}
        pending={pending}
        entryType={entryType}
        onEntryTypeChange={setEntryType}
        currencySymbol={currencySymbol}
        accountList={accountList}
        accountId={accountId}
        onAccountChange={setAccountId}
        parsedAmount={parsedAmount}
        parsedTitle={parsedTitle}
        memberList={memberList}
        splitMemberId={splitMemberId}
        onSplitMemberChange={setSplitMemberId}
        onAddMember={addMember}
        splitMode={splitMode}
        onSplitModeChange={setSplitMode}
        mySharePercent={mySharePercent}
        onShareChange={setMySharePercent}
        categories={categories}
        category={category}
        categoryMeta={categoryMeta}
        onCategoryChange={setCategory}
        moods={moods}
        mood={mood}
        moodMeta={moodMeta}
        onMoodChange={setMood}
        onOpenCategoryManager={() => {
          setEditingCategory(null);
          setCategoryError("");
          openDialog(categoryManagerRef, setCategoryManagerOpen);
        }}
        importText={importText}
        onImportTextChange={setImportText}
        receiptUrl={receiptUrl}
        scanning={scanning}
        onScanReceipt={scanReceipt}
        onRunParser={runParser}
        parsedPreview={parsedPreview}
        onConfirmParsed={confirmParsed}
        activeIncomeCategories={activeIncomeCategories}
        incomeCategory={incomeCategory}
        incomeMeta={incomeMeta}
        onIncomeCategoryChange={setIncomeCategory}
        selectedIncomeCategory={selectedIncomeCategory}
        onOpenIncomeManager={() => {
          setEditingIncomeCategory(null);
          setIncomeCategoryError("");
          openDialog(incomeManagerRef, setIncomeManagerOpen);
        }}
        nudgeActive={nudgeActive}
        threeDayImpulse={threeDayImpulse}
        reflectionPhrase={reflectionPhrase}
        reflection={reflection}
        onReflectionChange={setReflection}
        onClose={() => closeDialog(entryRef, setEntryOpen)}
        onSubmit={submitEntry}
      />

      <AestheticDialog
        open={aestheticOpen}
        dialogRef={aestheticRef}
        theme={theme}
        onClose={() => closeDialog(aestheticRef, setAestheticOpen)}
        onChooseTheme={chooseTheme}
      />

      {goalOpen && (
        <dialog
          className="expense-dialog account-dialog"
          ref={goalRef}
          onCancel={() => {
            closeSavingsGoalEditor();
            closeDialog(goalRef, setGoalOpen);
          }}
        >
          <form
            action={savingGoal ? contributeGoal : submitGoal}
            className="expense-form"
          >
            <button
              type="button"
              className="close-button"
              onClick={() => {
                closeSavingsGoalEditor();
                closeDialog(goalRef, setGoalOpen);
              }}
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
          onCancel={() => {
            closeSubscriptionEditor();
            closeDialog(subscriptionRef, setSubscriptionOpen);
          }}
        >
          <form
            action={submitSubscription}
            className="expense-form"
            key={editingSubscription?.id ?? "new"}
          >
            <button
              type="button"
              className="close-button"
              onClick={() => {
                closeSubscriptionEditor();
                closeDialog(subscriptionRef, setSubscriptionOpen);
              }}
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

      <LedgerMenuDialog
        open={ledgerMenuOpen}
        dialogRef={ledgerMenuRef}
        currentLedgerId={currentLedgerId}
        ledgers={ledgers}
        pending={pending}
        onClose={() => closeDialog(ledgerMenuRef, setLedgerMenuOpen)}
        onSelect={(ledgerId) => router.push("/?ledger=" + ledgerId)}
        onCreate={createLedger}
        onDelete={deleteLedger}
      />
      {authOpen && (
        <dialog
          className="expense-dialog auth-dialog"
          ref={authRef}
          onCancel={() => closeDialog(authRef, setAuthOpen)}
        >
          <button
            type="button"
            className="close-button"
            onClick={() => closeDialog(authRef, setAuthOpen)}
            aria-label="关闭账号窗口"
          >
            ×
          </button>
          <AuthPanel
            user={currentAuthUser}
            hasUsers={authHasUsers}
            onUserChange={setCurrentAuthUser}
          />
        </dialog>
      )}

      <NotificationDialog
        open={noticeOpen}
        dialogRef={noticeRef}
        currentLedgerId={currentLedgerId}
        notices={systemNotices}
        pendingFlows={pendingFlows}
        pendingTotal={pendingTotal}
        categories={categories}
        categoryMeta={categoryMeta}
        formatCurrency={formatCurrency}
        onClose={() => closeDialog(noticeRef, setNoticeOpen)}
        onRefreshPending={reloadPendingFlows}
        onProcessPending={(id, category, action) => processPending(id, category as Category | undefined, action)}
      />
      <DataCenterDialog
        open={dataOpen}
        dialogRef={dataRef}
        pending={pending}
        onClose={() => closeDialog(dataRef, setDataOpen)}
        restore={{
          summary: restoreResult.summary,
          snapshots: restoreSnapshots,
          onDismiss: restoreResult.dismiss,
          onRestoreFile: restoreBackup,
          onRestoreSnapshot: restoreSavedSnapshot,
        }}
        privacyLock={{
          enabled: privacyLock.enabled,
          pending: privacyLock.pending,
          onSubmit: configureLock,
        }}
        update={{
          info: updateInfo,
          checking: updateChecking,
          applying: updateApplying,
          error: updateError,
          onCheck: appUpdate.check,
          onApply: applyAppUpdate,
        }}
        billImport={{
          status: billImportStatus,
          error: billImportError,
          items: billImportItems,
          summary: billImportSummary,
          batches: importBatches,
          manualAccountKeys: billManualAccountKeys,
          accountActionKey: billAccountActionKey,
          accounts: accountList,
          formatCurrency,
          onClean: cleanBadBillImports,
          onParseFiles: parseBillFiles,
          onUndoBatch: undoImportBatch,
          onConfirm: confirmBillImport,
          onCreateAccountAndImport: createBillAccountAndImport,
          onUseManualAccount: (accountKey) => setBillManualAccountKeys((keys) => keys.includes(accountKey) ? keys : [...keys, accountKey]),
          onAssignAccount: assignBillAccount,
          onRemoveItem: (index) => setBillImportItems((rows) => rows.filter((_, rowIndex) => rowIndex !== index)),
        }}
        nearby={{
          accessUrl: nearbyAccessUrl,
          pairingCode: nearbyPairingCode,
          receiveCode: nearbyReceiveCode,
          download: nearbyDownload,
          packages: nearbyLanPackages,
          packageId: nearbyLanPackageId,
          uploading: nearbyLanUploading,
          peers: nearbyPeers,
          status: nearbyStatus,
          onCopy: copyToClipboard,
          onStatus: setNearbyStatus,
          onRefreshAddress: refreshNearbyAddress,
          onCreatePackage: createNearbyPackage,
          onDownloadPackage: downloadNearbyPackage,
          onUploadPackage: uploadNearbyPackage,
          onReceiveCodeChange: (value) => setNearbyReceiveCode(value.toUpperCase().slice(0, 8)),
          onReceivePackage: receiveNearbyLanPackage,
        }}
        webdav={{
          config: webdavConfig,
          session: webdavSession,
          mode: webdavSyncMode,
          syncing,
          status: syncStatus,
          onConfigChange: (patch) => setWebdavConfig((current) => ({ ...current, ...patch })),
          onSessionChange: (patch) => setWebdavSession((current) => ({ ...current, ...patch })),
          onPreset: () => setWebdavConfig((current) => ({ ...current, url: "https://dav.jianguoyun.com/dav/NeoLedger" })),
          onSync: syncWebDav,
        }}
        conflictReport={{
          report: lastMergeReport,
          label: syncConflictLabel,
          formatTimestamp,
        }}
        quickSync={{
          accessUrl: nearbyAccessUrl,
          ledgerId: currentLedgerId,
          status: quickSyncStatus,
          token: quickSyncToken,
          message: quickSyncMessage,
          label: quickSyncLabel,
          expiryDays: quickSyncExpiryDays,
          formatTimestamp,
          onLabelChange: setQuickSyncLabel,
          onExpiryChange: setQuickSyncExpiryDays,
          onCopyToken: () => {
            void copyToClipboard(quickSyncToken);
            setQuickSyncMessage("密钥已复制，请保存在可信设备中。");
          },
          onCopyAddress: () => {
            if (!nearbyAccessUrl) return;
            void copyToClipboard(nearbyAccessUrl);
            setQuickSyncMessage("手机连接地址已复制。");
          },
          onTest: testQuickSyncConnection,
          onCopyAndroidConfig: copyAndroidCompanionConfig,
          onCreateAndCopyAndroidConfig: createAndCopyAndroidConfig,
          onCopyExample: copyQuickSyncExample,
          onCopyTemplate: copyQuickSyncTemplate,
          onCreate: createQuickSyncToken,
          onRevoke: revokeQuickSyncToken,
        }}
      />
      <AccountDialogs
        transferOpen={transferOpen}
        accountOpen={accountOpen}
        transferRef={transferRef}
        accountRef={accountRef}
        accountList={accountList}
        editingAccount={editingAccount}
        accountType={accountType}
        transferError={transferError}
        accountError={accountError}
        pending={pending}
        formatCurrency={formatCurrency}
        submitTransfer={submitTransfer}
        submitAccount={submitAccount}
        onCloseTransfer={() => closeDialog(transferRef, setTransferOpen)}
        onCloseAccount={() => closeDialog(accountRef, setAccountOpen)}
        onAccountTypeChange={setAccountType}
        onRemoveAccount={confirmRemoveAccount}
      />

      <CategoryDialogs
        incomeOpen={incomeManagerOpen}
        expenseOpen={categoryManagerOpen}
        incomeRef={incomeManagerRef}
        expenseRef={categoryManagerRef}
        incomeCategories={incomeCategoryList}
        expenseCategories={categoryList}
        editingIncome={editingIncomeCategory}
        editingExpense={editingCategory}
        incomeError={incomeCategoryError}
        expenseError={categoryError}
        pending={pending}
        onCloseIncome={() => closeDialog(incomeManagerRef, setIncomeManagerOpen)}
        onCloseExpense={() => closeDialog(categoryManagerRef, setCategoryManagerOpen)}
        onEditIncome={setEditingIncomeCategory}
        onEditExpense={setEditingCategory}
        onRemoveIncome={removeIncomeCategory}
        onRestoreIncome={restoreIncomeCategory}
        onRemoveExpense={disableExpenseCategory}
        onRestoreExpense={restoreExpenseCategory}
        onSaveIncome={saveIncomeCategory}
        onSaveExpense={saveExpenseCategory}
      />
      <AssetDialogs
        assetOpen={assetOpen}
        assetRef={assetRef}
        editingAsset={editingAsset}
        liquidatingAsset={liquidatingAsset}
        assetType={assetType}
        assetValuationMode={assetValuationMode}
        assetError={assetError}
        pending={pending}
        todayKey={todayKey}
        accountList={accountList}
        formatCurrency={formatCurrency}
        liquidationRef={liquidationRef}
        onCloseAsset={closeAssetEditor}
        onCloseLiquidation={() => {
          liquidationRef.current?.close();
          assetManager.closeLiquidationState();
        }}
        onChooseAssetType={chooseAssetType}
        onValuationModeChange={setAssetValuationMode}
        onSubmitAsset={submitDigitalAsset}
        onSubmitLiquidation={submitLiquidation}
      />

      <InstallmentDialog
        open={installmentOpen}
        dialogRef={installmentRef}
        accountList={accountList}
        pending={pending}
        onClose={() => closeDialog(installmentRef, setInstallmentOpen)}
        onSubmit={submitInstallment}
      />

      <AchievementBadgeDialog
        open={badgeOpen}
        dialogRef={badgeRef}
        rank={rank}
        achievements={achievements}
        focusedBadge={focusedBadge}
        onClose={() => closeDialog(badgeRef, setBadgeOpen)}
        onClearFocus={() => setBadgeFocusCode(null)}
      />

      <BudgetDialog
        open={budgetOpen}
        dialogRef={budgetRef}
        ledgerId={currentLedgerId}
        budget={budget}
        pending={pending}
        onClose={() => closeDialog(budgetRef, setBudgetOpen)}
        onSubmit={submitBudget}
      />

      {/* Mobile Bottom Navigation Bar (visible on mobile < 640px) */}
      <MobileBottomNav
        currentTab={tab}
        onSelectTab={selectModule}
        onOpenEntry={openEntryDialog}
        hasUnreadNotice={hasUnreadNotice}
        offlineCount={offlineCount}
      />
    </main>
  );
}
