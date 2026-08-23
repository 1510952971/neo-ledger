const ARRAY_TABLES = [
  "ledgers", "accounts", "transactions", "budgetSettings", "categoryBudgets",
  "subscriptions", "savingsGoals", "members", "installments", "achievements",
  "sideHustleDeductions", "pendingTransactions", "systemNotifications",
  "fireSettings", "economicSettings", "crdtTombstones", "digitalAssets",
  "expenseCategories", "incomeCategories", "accountTransfers",
  "transactionReconciliation", "automationRules",
];

const ID_TABLES = new Set([
  "ledgers", "accounts", "transactions", "subscriptions", "savingsGoals",
  "members", "installments", "sideHustleDeductions", "pendingTransactions",
  "systemNotifications", "digitalAssets", "expenseCategories", "incomeCategories",
]);

const tombstoneTable = {
  ledger: "ledgers",
  account: "accounts",
  transaction: "transactions",
  subscription: "subscriptions",
  "savings-goal": "savingsGoals",
  installment: "installments",
};

const timestampOf = (row, snapshot) =>
  String(row.updatedAt || row.deletedAt || row.createdAt || snapshot.exportedAt || "1970-01-01T00:00:00.000Z");

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

function syncKey(table, row, source) {
  const ledger = row.ledgerSyncId;
  if (ledger) {
    if (table === "budgetSettings" || table === "fireSettings" || table === "economicSettings")
      return `${ledger}:${table}`;
    if (table === "categoryBudgets")
      return `${ledger}:${table}:${String(row.category ?? "")}`;
    if (table === "expenseCategories" || table === "incomeCategories")
      return `${ledger}:${table}:${String(row.builtinKey ?? row.name ?? "")}`;
    if (table === "members")
      return `${ledger}:${table}:${row.isMe ? "self" : String(row.name ?? row.id ?? "")}`;
    if (table === "achievements")
      return `${ledger}:${table}:${String(row.code ?? "")}`;
    if (table === "transactionReconciliation" && row.transactionSyncId)
      return `${ledger}:${table}:${row.transactionSyncId}`;
    if (table === "automationRules")
      return `${ledger}:${table}:${String(row.id ?? row.syncId ?? "")}`;
  }
  return String(
    row.syncId || row.uuid || row.crdtId ||
      `legacy:${source}:${table}:${row.id ?? `${row.ledgerId ?? ""}:${row.code ?? row.category ?? row.name ?? JSON.stringify(row)}`}`,
  );
}

export function mergeSyncSnapshots(local, remote) {
  const merged = {
    ...local,
    version: Math.max(Number(local.version || 0), Number(remote.version || 0), 23),
    exportedAt: new Date().toISOString(),
  };
  const tombstones = new Map();
  for (const [source, snapshot] of [["local", local], ["remote", remote]]) {
    for (const row of snapshot.syncTombstones || []) {
      const table = tombstoneTable[row.entityType] || row.table || row.entityType;
      const key = `${table}:${row.syncId || row.entityUuid}`;
      const current = tombstones.get(key);
      if (!current || String(row.deletedAt) > String(current.deletedAt))
        tombstones.set(key, { ...row, table, source });
    }
    for (const row of snapshot.crdtTombstones || []) {
      const key = `transactions:${row.crdtId}`;
      const current = tombstones.get(key);
      if (!current || String(row.deletedAt) > String(current.deletedAt))
        tombstones.set(key, {
          entityType: "transaction",
          table: "transactions",
          syncId: row.crdtId,
          deletedAt: row.deletedAt,
          source,
        });
    }
  }

  const winnersByTable = new Map();
  const conflicts = [];
  for (const table of ARRAY_TABLES) {
    if (table === "crdtTombstones") continue;
    const winners = new Map();
    for (const [source, snapshot] of [["remote", remote], ["local", local]]) {
      for (const row of Array.isArray(snapshot[table]) ? snapshot[table] : []) {
        const key = syncKey(table, row, source);
        const tomb = tombstones.get(`${table}:${key}`);
        if (tomb && String(tomb.deletedAt) >= timestampOf(row, snapshot)) continue;
        const current = winners.get(key);
        const candidate = { ...row, syncId: key };
        const timestamp = timestampOf(candidate, snapshot);
        const fingerprint = stableStringify(candidate);
        const candidateWins = !current || timestamp > current.timestamp || (timestamp === current.timestamp && fingerprint > current.fingerprint);
        if (current && current.fingerprint !== fingerprint) {
          const localEntry = source === "local" ? { row: candidate, timestamp } : current;
          const remoteEntry = source === "remote" ? { row: candidate, timestamp } : current;
          conflicts.push({ table, syncId: key, localTimestamp: localEntry.timestamp, remoteTimestamp: remoteEntry.timestamp, local: localEntry.row, remote: remoteEntry.row, result: candidateWins ? candidate : current.row, winner: candidateWins ? source : current.source });
        }
        if (candidateWins)
          winners.set(key, { row: candidate, timestamp, fingerprint, source });
      }
    }
    winnersByTable.set(table, [...winners.values()].map((value) => value.row));
  }

  const idMaps = new Map();
  for (const table of ID_TABLES) {
    const rows = winnersByTable.get(table) || [];
    const localIds = new Map(
      (Array.isArray(local[table]) ? local[table] : []).map((row) => [syncKey(table, row, "local"), Number(row.id)]),
    );
    const used = new Set([...localIds.values()].filter((id) => Number.isInteger(id) && id > 0));
    let nextId = Math.max(0, ...used) + 1;
    const map = new Map();
    for (const row of rows) {
      let id = localIds.get(row.syncId);
      if (!Number.isInteger(id) || id <= 0) {
        while (used.has(nextId)) nextId += 1;
        id = nextId++;
      }
      used.add(id);
      map.set(row.syncId, id);
      row.id = id;
    }
    idMaps.set(table, map);
  }

  const remap = (row, syncField, idField, table) => {
    if (row[syncField]) row[idField] = idMaps.get(table)?.get(row[syncField]) ?? row[idField];
  };
  for (const table of ARRAY_TABLES) {
    if (table === "crdtTombstones") continue;
    const rows = winnersByTable.get(table) || [];
    for (const row of rows) {
      remap(row, "ledgerSyncId", "ledgerId", "ledgers");
      remap(row, "accountSyncId", "accountId", "accounts");
      remap(row, "paymentAccountSyncId", "paymentAccountId", "accounts");
      remap(row, "fromAccountSyncId", "fromAccountId", "accounts");
      remap(row, "toAccountSyncId", "toAccountId", "accounts");
      remap(row, "transactionSyncId", "transactionId", "transactions");
      remap(row, "paidByMemberSyncId", "paidByMemberId", "members");
      remap(row, "splitWithMemberSyncId", "splitWithMemberId", "members");
      if (table === "automationRules") {
        if (row.conditionAccountSyncId && row.conditions)
          row.conditions.accountId = idMaps.get("accounts")?.get(row.conditionAccountSyncId) ?? row.conditions.accountId;
        if (row.actionAccountSyncId && row.actions)
          row.actions.accountId = idMaps.get("accounts")?.get(row.actionAccountSyncId) ?? row.actions.accountId;
      }
      if (table === "budgetSettings" && row.ledgerSyncId)
        row.id = idMaps.get("ledgers")?.get(row.ledgerSyncId) ?? row.id;
    }
    merged[table] = rows;
  }
  merged.syncTombstones = [...tombstones.values()].map((entry) => {
    const row = { ...entry };
    delete row.source;
    if (row.ledgerSyncId)
      row.ledgerId = idMaps.get("ledgers")?.get(row.ledgerSyncId) ?? row.ledgerId;
    return row;
  });
  merged.crdtTombstones = merged.syncTombstones
    .filter((row) => row.table === "transactions")
    .map((row) => ({ crdtId: row.syncId, ledgerId: row.ledgerId, deletedAt: row.deletedAt }));
  merged.mergeReport = {
    conflictCount: conflicts.length,
    conflicts: conflicts.slice(0, 200),
    truncated: Math.max(0, conflicts.length - 200),
  };
  return merged;
}
