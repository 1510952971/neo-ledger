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
