import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  ACCOUNT_TRANSFERS_APPLY_TRIGGER_SQL,
  ACCOUNT_TRANSFERS_OCCURRENCE_INDEX_SQL,
  ACCOUNT_TRANSFERS_TABLE_SQL,
  ACCOUNT_TRANSFERS_VALIDATE_TRIGGER_SQL,
  SCHEDULED_OCCURRENCES_TABLE_SQL,
} from "../db/transfer-schema.js";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
  db.exec("CREATE TABLE accounts(id INTEGER PRIMARY KEY,ledger_id INTEGER NOT NULL,type TEXT NOT NULL,current_balance INTEGER NOT NULL,currency TEXT NOT NULL)");
  db.exec("CREATE TABLE savings_goals(id INTEGER PRIMARY KEY,ledger_id INTEGER NOT NULL,target_amount INTEGER NOT NULL,saved_amount INTEGER NOT NULL DEFAULT 0)");
  db.exec(ACCOUNT_TRANSFERS_TABLE_SQL);
  db.exec(ACCOUNT_TRANSFERS_OCCURRENCE_INDEX_SQL);
  db.exec(ACCOUNT_TRANSFERS_VALIDATE_TRIGGER_SQL);
  db.exec(ACCOUNT_TRANSFERS_APPLY_TRIGGER_SQL);
  db.exec(SCHEDULED_OCCURRENCES_TABLE_SQL);
  db.exec("INSERT INTO accounts VALUES(1,1,'资产',10000,'CNY'),(2,1,'负债',-5000,'CNY'),(3,1,'资产',10000,'USD'),(4,2,'资产',10000,'CNY')");
  db.exec("INSERT INTO savings_goals VALUES(1,1,3000,0)");
  return db;
}

function transfer(db, values) {
  db.prepare("INSERT INTO account_transfers(uuid,ledger_id,kind,from_account_id,to_account_id,amount,currency,target_type,target_id,occurrence_key,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run(
      values.uuid,
      values.ledgerId ?? 1,
      values.kind ?? "账户转账",
      values.from ?? null,
      values.to ?? null,
      values.amount,
      values.currency ?? "CNY",
      values.targetType ?? null,
      values.targetId ?? null,
      values.occurrenceKey ?? null,
      "2026-07-15T12:00:00.000Z",
    );
}

function netWorth(db) {
  return db.prepare("SELECT SUM(current_balance) value FROM accounts WHERE ledger_id=1").get().value;
}

test("asset-to-liability repayment preserves net worth", () => {
  const db = database();
  const before = netWorth(db);
  transfer(db, { uuid: "repay-1", kind: "信用卡还款", from: 1, to: 2, amount: 3000 });
  assert.equal(db.prepare("SELECT current_balance value FROM accounts WHERE id=1").get().value, 7000);
  assert.equal(db.prepare("SELECT current_balance value FROM accounts WHERE id=2").get().value, -2000);
  assert.equal(netWorth(db), before);
});

test("failed overpayment and insufficient-funds transfers leave balances unchanged", () => {
  const db = database();
  assert.throws(
    () => transfer(db, { uuid: "overpay", kind: "信用卡还款", from: 1, to: 2, amount: 6000 }),
    /超过当前负债/,
  );
  assert.throws(
    () => transfer(db, { uuid: "empty", from: 1, to: 2, amount: 11000 }),
    /余额不足/,
  );
  assert.deepEqual(
    db.prepare("SELECT id,current_balance FROM accounts WHERE id IN (1,2) ORDER BY id").all().map((row) => ({ ...row })),
    [{ id: 1, current_balance: 10000 }, { id: 2, current_balance: -5000 }],
  );
});

test("currency and ledger boundaries are enforced by the database", () => {
  const db = database();
  assert.throws(
    () => transfer(db, { uuid: "fx", from: 1, to: 3, amount: 100, currency: "CNY" }),
    /币种不匹配/,
  );
  assert.throws(
    () => transfer(db, { uuid: "ledger", from: 1, to: 4, amount: 100 }),
    /账户或币种不匹配/,
  );
});

test("savings transfer preserves combined account and goal value", () => {
  const db = database();
  const before = netWorth(db);
  transfer(db, {
    uuid: "save-1",
    kind: "储蓄存入",
    from: 1,
    amount: 2500,
    targetType: "savings-goal",
    targetId: 1,
  });
  const saved = db.prepare("SELECT saved_amount value FROM savings_goals WHERE id=1").get().value;
  assert.equal(saved, 2500);
  assert.equal(netWorth(db) + saved, before);
  assert.throws(
    () => transfer(db, { uuid: "save-over", kind: "储蓄存入", from: 1, amount: 501, targetId: 1 }),
    /超过心愿剩余目标/,
  );
});

test("one automatic occurrence can be claimed and deducted only once", () => {
  const db = database();
  const claim = db.prepare("INSERT OR IGNORE INTO scheduled_occurrences(occurrence_key,ledger_id,source_type,source_id) VALUES('subscription:1:2026-07-15',1,'subscription',1)");
  assert.equal(claim.run().changes, 1);
  assert.equal(claim.run().changes, 0);
  transfer(db, { uuid: "auto-1", from: 1, amount: 1000, occurrenceKey: "subscription:1:2026-07-15" });
  assert.throws(
    () => transfer(db, { uuid: "auto-2", from: 1, amount: 1000, occurrenceKey: "subscription:1:2026-07-15" }),
    /UNIQUE constraint failed/,
  );
  assert.equal(db.prepare("SELECT current_balance value FROM accounts WHERE id=1").get().value, 9000);
});
