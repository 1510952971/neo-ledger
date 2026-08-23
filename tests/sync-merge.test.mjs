import assert from "node:assert/strict";
import test from "node:test";
import { mergeSyncSnapshots } from "../app/sync-merge.js";

const ledger = (updatedAt, name = "家庭账本") => ({
  id: 1,
  syncId: "ledger-global-1",
  uuid: "ledger-global-1",
  name,
  icon: "home",
  updatedAt,
  createdAt: "2026-01-01T00:00:00.000Z",
});

test("newer UUID record wins and relationships follow remapped local IDs", () => {
  const local = {
    version: 19,
    exportedAt: "2026-07-15T10:00:00.000Z",
    ledgers: [ledger("2026-07-15T09:00:00.000Z", "旧名称")],
    accounts: [{ id: 7, syncId: "account-global-1", ledgerSyncId: "ledger-global-1", ledgerId: 1, name: "银行卡", updatedAt: "2026-07-15T09:00:00.000Z" }],
    transactions: [],
  };
  const remote = {
    version: 19,
    exportedAt: "2026-07-15T11:00:00.000Z",
    ledgers: [ledger("2026-07-15T11:00:00.000Z", "新名称")],
    accounts: [{ id: 99, syncId: "account-global-1", ledgerSyncId: "ledger-global-1", ledgerId: 99, name: "工资卡", updatedAt: "2026-07-15T11:00:00.000Z" }],
    transactions: [{ id: 50, syncId: "transaction-global-1", ledgerSyncId: "ledger-global-1", accountSyncId: "account-global-1", ledgerId: 99, accountId: 99, title: "早餐", updatedAt: "2026-07-15T11:00:00.000Z" }],
  };
  const merged = mergeSyncSnapshots(local, remote);
  assert.equal(merged.ledgers[0].name, "新名称");
  assert.equal(merged.accounts[0].id, 7);
  assert.equal(merged.accounts[0].ledgerId, 1);
  assert.equal(merged.transactions[0].accountId, 7);
  assert.equal(merged.transactions[0].ledgerId, 1);
});

test("a newer tombstone prevents deleted records from returning after restore", () => {
  const local = {
    version: 19,
    exportedAt: "2026-07-15T10:00:00.000Z",
    ledgers: [ledger("2026-07-15T09:00:00.000Z")],
    accounts: [],
    transactions: [{ id: 1, syncId: "tx-deleted", ledgerSyncId: "ledger-global-1", ledgerId: 1, updatedAt: "2026-07-15T08:00:00.000Z" }],
    syncTombstones: [{ entityType: "transaction", entityUuid: "tx-deleted", syncId: "tx-deleted", ledgerSyncId: "ledger-global-1", ledgerId: 1, deletedAt: "2026-07-15T09:00:00.000Z" }],
  };
  const remote = {
    version: 19,
    exportedAt: "2026-07-15T11:00:00.000Z",
    ledgers: [ledger("2026-07-15T09:00:00.000Z")],
    accounts: [],
    transactions: [{ id: 88, syncId: "tx-deleted", ledgerSyncId: "ledger-global-1", ledgerId: 88, updatedAt: "2026-07-15T08:30:00.000Z" }],
  };
  const merged = mergeSyncSnapshots(local, remote);
  assert.equal(merged.transactions.length, 0);
  assert.equal(merged.syncTombstones[0].ledgerId, 1);
  assert.equal(merged.syncTombstones[0].entityUuid, "tx-deleted");
});

test("natural-key tables do not duplicate after a backup moves to another installation", () => {
  const common = {
    version: 22,
    ledgers: [ledger("2026-07-15T09:00:00.000Z")],
    accounts: [],
    transactions: [],
  };
  const category = (installation, id) => ({
    id,
    syncId: `${installation}:expenseCategories:${id}`,
    ledgerSyncId: "ledger-global-1",
    ledgerId: id,
    name: "餐饮",
    builtinKey: "餐饮",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const local = {
    ...common,
    exportedAt: "2026-07-15T10:00:00.000Z",
    expenseCategories: [category("installation-b", 41)],
  };
  const remote = {
    ...common,
    exportedAt: "2026-07-15T11:00:00.000Z",
    expenseCategories: [category("installation-a", 1)],
  };

  const merged = mergeSyncSnapshots(local, remote);

  assert.equal(merged.expenseCategories.length, 1);
  assert.equal(merged.expenseCategories[0].id, 41);
  assert.equal(merged.expenseCategories[0].ledgerId, 1);
});

test("v23 reconciliation and automation rules survive cross-device ID remapping", () => {
  const local = {
    version: 23,
    exportedAt: "2026-08-16T10:00:00.000Z",
    ledgers: [ledger("2026-08-16T09:00:00.000Z")],
    accounts: [{ id: 7, syncId: "account-sync", ledgerSyncId: "ledger-global-1", ledgerId: 1, name: "本机账户", updatedAt: "2026-08-16T09:00:00.000Z" }],
    transactions: [{ id: 8, syncId: "tx-sync", ledgerSyncId: "ledger-global-1", accountSyncId: "account-sync", ledgerId: 1, accountId: 7, title: "本机标题", updatedAt: "2026-08-16T09:00:00.000Z" }],
    transactionReconciliation: [],
    automationRules: [],
  };
  const remote = {
    version: 23,
    exportedAt: "2026-08-16T11:00:00.000Z",
    ledgers: [ledger("2026-08-16T09:00:00.000Z")],
    accounts: [{ id: 99, syncId: "account-sync", ledgerSyncId: "ledger-global-1", ledgerId: 90, name: "云端账户", updatedAt: "2026-08-16T11:00:00.000Z" }],
    transactions: [{ id: 100, syncId: "tx-sync", ledgerSyncId: "ledger-global-1", accountSyncId: "account-sync", ledgerId: 90, accountId: 99, title: "云端标题", updatedAt: "2026-08-16T11:00:00.000Z" }],
    transactionReconciliation: [{ ledgerSyncId: "ledger-global-1", transactionSyncId: "tx-sync", ledgerId: 90, transactionId: 100, status: "reconciled", updatedAt: "2026-08-16T11:00:00.000Z" }],
    automationRules: [{ id: "coffee-rule", ledgerSyncId: "ledger-global-1", ledgerId: 90, name: "咖啡", conditions: { accountId: 99 }, actions: { accountId: 99, category: "餐饮" }, conditionAccountSyncId: "account-sync", actionAccountSyncId: "account-sync", updatedAt: "2026-08-16T11:00:00.000Z" }],
  };
  const merged = mergeSyncSnapshots(local, remote);
  assert.equal(merged.version, 23);
  assert.equal(merged.transactions[0].id, 8);
  assert.equal(merged.transactionReconciliation[0].transactionId, 8);
  assert.equal(merged.automationRules[0].conditions.accountId, 7);
  assert.equal(merged.automationRules[0].actions.accountId, 7);
  assert.ok(merged.mergeReport.conflictCount >= 2);
});

test("1000 randomized two-device merges preserve winners and relationships", () => {
  let seed = 0x5eed1234;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000);
  for (let index = 0; index < 1000; index += 1) {
    const localNewer = random() >= 0.5;
    const localTime = localNewer ? "2026-08-16T12:00:00.000Z" : "2026-08-16T10:00:00.000Z";
    const remoteTime = localNewer ? "2026-08-16T10:00:00.000Z" : "2026-08-16T12:00:00.000Z";
    const snapshot = (source, accountId, transactionId, updatedAt) => ({
      version: 23,
      exportedAt: updatedAt,
      ledgers: [ledger(updatedAt)],
      accounts: [{ id: accountId, syncId: `account-${index}`, ledgerSyncId: "ledger-global-1", ledgerId: accountId, name: `${source}-account`, updatedAt }],
      transactions: [{ id: transactionId, syncId: `tx-${index}`, ledgerSyncId: "ledger-global-1", accountSyncId: `account-${index}`, ledgerId: accountId, accountId, title: `${source}-winner`, amount: 100 + index, updatedAt }],
      transactionReconciliation: [{ ledgerSyncId: "ledger-global-1", transactionSyncId: `tx-${index}`, ledgerId: accountId, transactionId, status: source === "local" ? "exception" : "reconciled", updatedAt }],
      automationRules: [{ id: `rule-${index}`, ledgerSyncId: "ledger-global-1", ledgerId: accountId, name: `${source}-rule`, conditions: { accountId }, actions: { accountId }, conditionAccountSyncId: `account-${index}`, actionAccountSyncId: `account-${index}`, updatedAt }],
    });
    const local = snapshot("local", 1 + index * 2, 2 + index * 2, localTime);
    const remote = snapshot("remote", 5000 + index * 2, 5001 + index * 2, remoteTime);
    const merged = mergeSyncSnapshots(local, remote);
    const expectedSource = localNewer ? "local" : "remote";
    assert.equal(merged.transactions[0].title, `${expectedSource}-winner`);
    assert.equal(merged.transactions[0].accountId, merged.accounts[0].id);
    assert.equal(merged.transactions[0].ledgerId, merged.ledgers[0].id);
    assert.equal(merged.transactionReconciliation[0].transactionId, merged.transactions[0].id);
    assert.equal(merged.automationRules[0].conditions.accountId, merged.accounts[0].id);
    assert.equal(merged.automationRules[0].actions.accountId, merged.accounts[0].id);
  }
});
