export function sqliteQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function sqliteBackupArgs(databasePath, backupPath) {
  return [
    "-cmd",
    ".timeout 10000",
    databasePath,
    `.backup ${sqliteQuote(backupPath)}`,
  ];
}

export function sqliteRestoreArgs(databasePath, backupPath) {
  return [
    "-cmd",
    ".timeout 10000",
    databasePath,
    `.restore ${sqliteQuote(backupPath)}`,
  ];
}
