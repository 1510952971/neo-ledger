import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");

test("ledger app remains below the reviewed monolith budget", () => {
  const lines = source.split(/\r?\n/u).length;
  assert.ok(lines <= 9000, `ledger-app.tsx grew to ${lines} lines; extract a domain before adding more`);
  const directStates = source.match(/^  const \[[^\]]+, set[^\]]+\] = useState/gmu)?.length ?? 0;
  const directEffects = source.match(/^  useEffect\(/gmu)?.length ?? 0;
  assert.ok(directStates <= 81, `ledger-app.tsx grew to ${directStates} direct state hooks; move a state machine out first`);
  assert.ok(directEffects <= 0, `ledger-app.tsx grew to ${directEffects} direct effects; move a lifecycle out first`);
  assert.match(source, /buildFinancialInsights\(/u, "financial insight calculations must stay outside the page component");
});

test("planning domains remain composed through extracted sections", () => {
  assert.match(source, /usePlanningState/u, "planning state must stay outside the page component");
  assert.doesNotMatch(source, /useState\(categoryBudgets\)/u, "category budget collection state leaked back into ledger-app");
  assert.doesNotMatch(source, /useState\(members\)/u, "member collection state leaked back into ledger-app");
  for (const component of [
    "SubscriptionSection",
    "SavingsGoalSection",
    "InstallmentSection",
    "CategoryBudgetSection",
    "SettlementSection",
    "AnalyticsSection",
    "AchievementBadgeDialog",
    "OnboardingCard",
    "BudgetDialog",
    "InstallmentDialog",
  ]) {
    assert.match(source, new RegExp(`<${component}\\b`, "u"), `${component} is no longer composed by ledger-app`);
  }
  for (const embeddedHeading of ["<h2>我的续费</h2>", "<h2>品类预算</h2>", "<h2>分账搭子</h2>", "<section className=\"analytics-page\">", "<dialog className=\"expense-dialog data-dialog\">", "<dialog className=\"expense-dialog notice-dialog\">", "<dialog className=\"expense-dialog ledger-menu-dialog\">", "<dialog className=\"expense-dialog badge-dialog\">"])
    assert.ok(!source.includes(embeddedHeading), `${embeddedHeading} moved back into the main component`);
});

test("AI chat stays isolated from the page component", () => {
  assert.match(source, /useAiChatState\(\{ ledgerId: currentLedgerId \}\)/u);
  assert.doesNotMatch(source, /useState<ChatMessage>/u);
  assert.doesNotMatch(source, /fetch\("\/api\/v1\/ai\/chat"/u);
});

test("AI server route keeps model calls bounded and schema-checked", () => {
  const route = readFileSync(new URL("../app/api/v1/ai/chat/route.ts", import.meta.url), "utf8");
  assert.match(route, /normalizeAiRequestBody/u);
  assert.match(route, /fetchWithTimeout/u);
  assert.match(route, /15_000/u);
  assert.match(route, /本地模型连接失败.*502/u);
  assert.match(route, /readResponseTextWithLimit\(response, 256 \* 1024\)/u);
  assert.match(route, /normalizeAiModelAnswer/u);
});

test("WebDAV sync state stays outside the page component", () => {
  assert.match(source, /useWebDavSyncState\(\)/u);
  assert.match(source, /useWebDavAutoSync\(/u);
  assert.doesNotMatch(source, /shouldRunCloudSync/u);
  assert.doesNotMatch(source, /webdavSyncLockRef/u);
  assert.doesNotMatch(source, /useState\("尚未同步"\)/u);
});

test("WebDAV auto-sync owns browser listeners and timer cleanup", () => {
  const autoSyncSource = readFileSync(new URL("../app/webdav-auto-sync.ts", import.meta.url), "utf8");
  assert.match(autoSyncSource, /shouldRunCloudSync/u);
  assert.match(autoSyncSource, /addEventListener\("focus"/u);
  assert.match(autoSyncSource, /addEventListener\("online"/u);
  assert.match(autoSyncSource, /clearInterval/u);
  assert.match(autoSyncSource, /removeEventListener\("focus"/u);
  assert.match(autoSyncSource, /removeEventListener\("online"/u);
  assert.match(autoSyncSource, /parseWebDavLastSyncAt/u);
  assert.doesNotMatch(autoSyncSource, /response\.json\(\)/u);
});

test("data-center visibility lifecycle stays outside the page component", () => {
  assert.match(source, /useDataCenterLifecycle\(/u);
  assert.doesNotMatch(source, /checkAppUpdateEffect/u);
  assert.doesNotMatch(source, /loadQuickSyncStatusEffect/u);
  assert.doesNotMatch(source, /loadImportBatchesEffect/u);
  const lifecycleSource = readFileSync(new URL("../app/data-center-lifecycle.ts", import.meta.url), "utf8");
  assert.match(lifecycleSource, /useEffectEvent/u);
  assert.match(lifecycleSource, /updateAvailable/u);
  assert.match(lifecycleSource, /if \(!active\) return/u);
});

test("confirm dialog modal lifecycle stays outside the page component", () => {
  assert.match(source, /useConfirmDialogLifecycle\(/u);
  const lifecycleSource = readFileSync(new URL("../app/confirm-dialog-lifecycle.ts", import.meta.url), "utf8");
  assert.match(lifecycleSource, /showModal\(\)/u);
  assert.match(lifecycleSource, /if \(!open\) return/u);
});

test("transaction view refresh lifecycle stays outside the page component", () => {
  assert.match(source, /useTransactionViewLifecycle\(/u);
  assert.doesNotMatch(source, /refreshTransactionView\);/u);
  const lifecycleSource = readFileSync(new URL("../app/transaction-view-lifecycle.ts", import.meta.url), "utf8");
  assert.match(lifecycleSource, /requestAnimationFrame/u);
  assert.match(lifecycleSource, /cancelAnimationFrame/u);
  assert.match(lifecycleSource, /useEffectEvent/u);
});

test("auth notice lifecycle has explicit query matching and cleanup", () => {
  assert.match(source, /useAuthNoticeLifecycle\(/u);
  const lifecycleSource = readFileSync(new URL("../app/auth-notice-lifecycle.ts", import.meta.url), "utf8");
  assert.match(lifecycleSource, /auth_notice/u);
  assert.match(lifecycleSource, /auth_error/u);
  assert.match(lifecycleSource, /cancelAnimationFrame/u);
});

test("achievement badge lifecycle stays outside the page component", () => {
  assert.match(source, /useAchievementBadgeLifecycle\(/u);
  const lifecycleSource = readFileSync(new URL("../app/achievement-badge-lifecycle.ts", import.meta.url), "utf8");
  assert.match(lifecycleSource, /selectDailyBadgeCode/u);
  assert.match(lifecycleSource, /neo-badges-daily-v2/u);
  assert.match(lifecycleSource, /requestAnimationFrame/u);
});

test("application shell state stays outside the page component", () => {
  assert.match(source, /useAppShellState\(\{ initialTheme, authUser \}\)/u);
  assert.doesNotMatch(source, /useState\(/u);
});

test("ledger refresh orchestration stays outside the page component", () => {
  assert.match(source, /useLedgerRefresh\(\{/u);
  for (const functionName of [
    "reloadAccounts",
    "reloadGoals",
    "reloadSubscriptions",
    "reloadDigitalAssets",
    "reloadCategories",
    "reloadIncomeCategories",
  ])
    assert.doesNotMatch(
      source,
      new RegExp(`async function ${functionName}\\s*\\(`, "u"),
      `${functionName} should remain in the refresh coordinator`,
    );
});

test("ledger refresh reads bounded client responses", () => {
  const refreshSource = readFileSync(new URL("../app/ledger-refresh.ts", import.meta.url), "utf8");
  assert.match(refreshSource, /fetchClientJson/u);
  assert.doesNotMatch(refreshSource, /response\.json\(\)/u);
});

test("account and transfer writes stay in the account action coordinator", () => {
  assert.match(source, /useLedgerAccountActions\(\{/u);
  for (const functionName of ["submitAccount", "submitTransfer", "removeAccount"])
    assert.doesNotMatch(
      source,
      new RegExp(`function ${functionName}\\s*\\(`, "u"),
      `${functionName} should remain in the account action coordinator`,
    );
  const accountSource = readFileSync(new URL("../app/ledger-account-actions.ts", import.meta.url), "utf8");
  assert.match(accountSource, /createBillImportAccount/u);
  assert.match(accountSource, /fetchClientJson/u);
  assert.doesNotMatch(source, /fetchClientJson[^\n]*\/api\/accounts/u);
  assert.match(source, /runBillImportAccountWorkflow/u);
  assert.doesNotMatch(source, /const mappedRows = rows\.map/u);
  const accountWorkflowSource = readFileSync(new URL("../app/bill-import-account-workflow.ts", import.meta.url), "utf8");
  assert.match(accountWorkflowSource, /import-failed/u);
  assert.match(source, /confirmBillImportWorkflow/u);
  assert.match(source, /注销账户「\$\{editingAccount\.name\}」/u);
  assert.match(source, /removeAccountRequest\(\)/u);
});

test("transaction edit writes stay in the transaction action coordinator", () => {
  assert.match(source, /useLedgerTransactionActions\(\{/u);
  assert.doesNotMatch(source, /function submitTransactionEdit\s*\(/u);
  assert.doesNotMatch(source, /fetch\("\/api\/transactions"/u);
});

test("reconciliation state uses bounded client responses", () => {
  const source = readFileSync(new URL("../app/reconciliation-state.ts", import.meta.url), "utf8");
  assert.match(source, /loadReconciliationRows|updateReconciliation/u);
  assert.doesNotMatch(source, /fetchClientJson/u);
  const actionSource = readFileSync(new URL("../app/reconciliation-actions.ts", import.meta.url), "utf8");
  assert.match(actionSource, /fetchClientJson/u);
  assert.match(actionSource, /DEFAULT_CLIENT_RESPONSE_BYTES/u);
  assert.doesNotMatch(actionSource, /response\.json\(\)/u);
});

test("bill import batch writes stay in the import action coordinator", () => {
  assert.match(source, /useLedgerBillImportActions<ImportedBill, ImportBatch>\(\{/u);
  for (const functionName of ["submitBillRows", "loadImportBatches", "undoImportBatch"])
    assert.doesNotMatch(
      source,
      new RegExp(`async function ${functionName}\\s*\\(`, "u"),
      `${functionName} should remain in the bill import coordinator`,
    );
});

test("manual bill import confirmation stays in its workflow boundary", () => {
  const workflowSource = readFileSync(new URL("../app/confirm-bill-import-workflow.ts", import.meta.url), "utf8");
  assert.match(workflowSource, /unmapped/u);
  assert.match(workflowSource, /refreshLedger/u);
  assert.doesNotMatch(source, /const unmapped = billImportItems\.filter/u);
});

test("bill parsing keeps a dedicated large but finite client response budget", () => {
  const billSource = readFileSync(new URL("../app/ledger-bill-import-actions.ts", import.meta.url), "utf8");
  assert.match(billSource, /fetchClientJson/u);
  assert.match(billSource, /MAX_BILL_IMPORT_RESPONSE_BYTES/u);
  assert.match(billSource, /previewBillImport/u);
  assert.match(source, /previewBillImport/u);
  assert.doesNotMatch(source, /fetch\("\/api\/bill-import"/u);
  assert.match(source, /runBillImportWorkflow/u);
  assert.doesNotMatch(source, /const parsedBatch = await parseStatementFiles/u);
  const workflowSource = readFileSync(new URL("../app/bill-import-workflow.ts", import.meta.url), "utf8");
  assert.match(workflowSource, /automatic-failed/u);
  assert.match(workflowSource, /failuresMessage/u);
});

test("nearby and WebDAV sync responses use bounded client parsing", () => {
  const start = source.indexOf("async function uploadNearbyPackage");
  const end = source.indexOf("function syncWebDav", start);
  assert.ok(start >= 0 && end > start, "sync action region must remain discoverable");
  const syncSource = source.slice(start, end);
  assert.match(syncSource, /MAX_P2P_PACKAGE_RESPONSE_BYTES/u);
  assert.match(syncSource, /fetchClientText/u);
  assert.doesNotMatch(syncSource, /fetchClientJson/u);
  assert.doesNotMatch(syncSource, /response\.json\(\)/u);
  const webdavSource = readFileSync(new URL("../app/webdav-actions.ts", import.meta.url), "utf8");
  assert.match(webdavSource, /MAX_WEBDAV_RESPONSE_BYTES/u);
  assert.match(webdavSource, /fetchClientJson/u);
  assert.match(source, /runWebDavSyncWorkflow/u);
  assert.match(source, /runNearbyMergeWorkflow/u);
  assert.match(source, /uploadWebDavSnapshot|downloadWebDavSnapshot/u);
  const workflowSource = readFileSync(new URL("../app/webdav-sync-workflow.ts", import.meta.url), "utf8");
  assert.match(workflowSource, /首次安全同步/u);
  assert.match(workflowSource, /安全双向同步/u);
  const nearbySource = readFileSync(new URL("../app/nearby-actions.ts", import.meta.url), "utf8");
  assert.match(nearbySource, /MAX_P2P_PACKAGE_RESPONSE_BYTES/u);
  assert.match(nearbySource, /uploadNearbyPackage|downloadNearbyPackage|deleteNearbyPackage/u);
  assert.match(nearbySource, /announceNearbyDevice|discoverNearbyPeers|leaveNearbyDiscovery|listNearbyPackages/u);
  const nearbyWorkflowSource = readFileSync(new URL("../app/nearby-sync-workflow.ts", import.meta.url), "utf8");
  assert.match(nearbyWorkflowSource, /清理局域网同步包失败/u);
  assert.match(nearbyWorkflowSource, /conflictCount/u);
  const nearbyPackageSource = readFileSync(new URL("../app/nearby-package-workflow.ts", import.meta.url), "utf8");
  assert.match(nearbyPackageSource, /读取本地账本失败/u);
  assert.match(nearbyPackageSource, /fileName/u);
  assert.match(source, /createNearbyPackageWorkflow/u);
  const snapshotSource = readFileSync(new URL("../app/snapshot-actions.ts", import.meta.url), "utf8");
  assert.match(snapshotSource, /MAX_SYNC_SNAPSHOT_RESPONSE_BYTES/u);
  assert.match(snapshotSource, /fetchClientJson/u);
  assert.match(source, /exportLedgerSnapshot|restoreSnapshotData/u);
  const nearbyStateSource = readFileSync(new URL("../app/nearby-sync-state.ts", import.meta.url), "utf8");
  assert.doesNotMatch(nearbyStateSource, /fetchClientJson/u);
});

test("offline and quick-sync responses use bounded client parsing", () => {
  const offlineSource = readFileSync(new URL("../app/offline-actions.ts", import.meta.url), "utf8");
  assert.match(offlineSource, /MAX_OFFLINE_SYNC_RESPONSE_BYTES/u);
  assert.match(offlineSource, /fetchClientJson/u);
  assert.doesNotMatch(offlineSource, /response\.json\(\)/u);

  const quickSource = readFileSync(new URL("../app/quick-sync-actions.ts", import.meta.url), "utf8");
  assert.match(quickSource, /fetchClientJson/u);
  assert.match(quickSource, /testQuickSyncConnection/u);
  assert.doesNotMatch(quickSource, /response\.json\(\)/u);
  assert.match(source, /createQuickSyncTokenRequest/u);
  assert.match(source, /testQuickSyncConnectionRequest/u);
});

test("restore uploads are size-bounded and use a resilient client response boundary", () => {
  const start = source.indexOf("async function restoreBackup");
  const end = source.indexOf("function parseBillFiles", start);
  assert.ok(start >= 0 && end > start, "restore action region must remain discoverable");
  const restoreSource = source.slice(start, end);
  assert.match(restoreSource, /runRestoreBackupWorkflow|runRestoreSnapshotWorkflow/u);
  assert.doesNotMatch(restoreSource, /restoreBackupPayload|restoreSavedSnapshotRequest/u);
  assert.doesNotMatch(restoreSource, /fetchClientJson/u);
  assert.match(restoreSource, /catch \(error\)/u);
  assert.doesNotMatch(restoreSource, /response\.json\(\)/u);
  const restoreActionSource = readFileSync(new URL("../app/restore-actions.ts", import.meta.url), "utf8");
  assert.match(restoreActionSource, /fetchClientJson/u);
  assert.match(restoreActionSource, /MAX_RESTORE_UPLOAD_BYTES/u);
  const restoreWorkflowSource = readFileSync(new URL("../app/restore-workflow.ts", import.meta.url), "utf8");
  assert.match(restoreWorkflowSource, /dryRun/u);
  assert.match(restoreWorkflowSource, /planChecksum/u);
  assert.match(restoreWorkflowSource, /confirm/u);
});

test("asset and category writes use bounded client responses", () => {
  const start = source.indexOf("function submitDigitalAsset");
  const end = source.indexOf("function processPending", start);
  assert.ok(start >= 0 && end > start, "asset/category action region must remain discoverable");
  const catalogSource = source.slice(start, end);
  assert.doesNotMatch(catalogSource, /response\.json\(\)/u);
  assert.match(catalogSource, /saveAsset|liquidateAsset|saveCategory|removeCategory|restoreCategory/u);
  const actionSource = `${readFileSync(new URL("../app/asset-actions.ts", import.meta.url), "utf8")}\n${readFileSync(new URL("../app/category-actions.ts", import.meta.url), "utf8")}`;
  assert.match(actionSource, /fetchClientJson/u);
  assert.match(catalogSource, /setAssetError\(error instanceof Error/u);
  assert.match(catalogSource, /setCategoryError\(error instanceof Error/u);
  assert.match(catalogSource, /setIncomeCategoryError\(error instanceof Error/u);
});

test("planning and recurring writes use bounded client responses", () => {
  const goalStart = source.indexOf("function submitGoal");
  const goalEnd = source.indexOf("function chooseTheme", goalStart);
  assert.ok(goalStart >= 0 && goalEnd > goalStart, "goal action region must remain discoverable");
  const goalSource = source.slice(goalStart, goalEnd);
  assert.match(goalSource, /createSavingsGoal|contributeSavingsGoal|deleteSavingsGoal/u);
  assert.doesNotMatch(goalSource, /fetchClientJson/u);
  assert.doesNotMatch(goalSource, /response\.json\(\)/u);
  assert.match(goalSource, /setGoalError\(error instanceof Error/u);
  const goalActionSource = readFileSync(new URL("../app/savings-goal-actions.ts", import.meta.url), "utf8");
  assert.match(goalActionSource, /fetchClientJson/u);
  assert.match(goalActionSource, /contributeSavingsGoal/u);

  const recurringStart = source.indexOf("function submitSubscription");
  const recurringEnd = source.indexOf("async function restoreBackup", recurringStart);
  assert.ok(recurringStart >= 0 && recurringEnd > recurringStart, "recurring action region must remain discoverable");
  const recurringSource = source.slice(recurringStart, recurringEnd);
  assert.match(recurringSource, /saveSubscription|removeSubscriptionRequest|createInstallment|removeInstallmentRequest/u);
  assert.doesNotMatch(recurringSource, /fetchClientJson/u);
  assert.doesNotMatch(recurringSource, /response\.json\(\)/u);
  const recurringActionSource = readFileSync(new URL("../app/recurring-actions.ts", import.meta.url), "utf8");
  assert.match(recurringActionSource, /fetchClientJson/u);
  assert.match(recurringActionSource, /saveSubscription/u);
  assert.match(recurringActionSource, /createInstallment|removeInstallment/u);
});

test("ledger and settlement writes use bounded client responses", () => {
  const start = source.indexOf("async function createLedger");
  const end = source.indexOf("\n  const categorySpend", start);
  assert.ok(start >= 0 && end > start, "ledger/settlement action region must remain discoverable");
  const ledgerSource = source.slice(start, end);
  assert.match(ledgerSource, /createMember|settleMember/u);
  assert.doesNotMatch(ledgerSource, /fetchClientJson/u);
  assert.doesNotMatch(ledgerSource, /response\.json\(\)/u);
  assert.match(ledgerSource, /添加成员失败/u);
  assert.match(ledgerSource, /平账失败/u);
  const memberSource = readFileSync(new URL("../app/member-actions.ts", import.meta.url), "utf8");
  assert.match(memberSource, /fetchClientJson/u);
  assert.match(memberSource, /createMember/u);
});

test("settings, pending flows and budgets use bounded client responses", () => {
  const start = source.indexOf("function saveInflation");
  const end = source.indexOf("async function configureLock", start);
  assert.ok(start >= 0 && end > start, "settings action region must remain discoverable");
  const settingsSource = source.slice(start, end);
  assert.match(settingsSource, /saveInflationSettings|saveFireSettings|processPendingTransaction|saveCategoryBudgetRequest|saveTheme/u);
  assert.doesNotMatch(settingsSource, /fetchClientJson/u);
  assert.doesNotMatch(settingsSource, /response\.json\(\)/u);
  assert.match(settingsSource, /通胀设置保存失败/u);
  assert.match(settingsSource, /待确认流水处理失败/u);
  assert.match(settingsSource, /预算保存失败/u);
});

test("transaction entry submission stays in the online/offline entry coordinator", () => {
  assert.match(source, /useLedgerEntryActions(?:<[^>]+>)?\(\{/u);
  assert.doesNotMatch(source, /function submitEntry\s*\(/u);
  assert.doesNotMatch(source, /function confirmParsed\s*\(/u);
});
