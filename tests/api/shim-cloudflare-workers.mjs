import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.NL_DB);
db.exec("PRAGMA foreign_keys=ON");

class D1Stmt {
  constructor(sql) { this.sql = sql; this.params = []; }
  bind(...params) { const s = new D1Stmt(this.sql); s.params = params.map(p => p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p); return s; }
  _prep() { return db.prepare(this.sql); }
  async first(col) {
    const row = this._prep().get(...this.params) ?? null;
    if (row === null) return null;
    return col ? row[col] : row;
  }
  async all() {
    const results = this._prep().all(...this.params);
    return { results, success: true, meta: {} };
  }
  async run() {
    const info = this._prep().run(...this.params);
    return { success: true, meta: { last_row_id: Number(info.lastInsertRowid), changes: info.changes, rows_written: info.changes } };
  }
  async raw() {
    const rows = this._prep().all(...this.params);
    return rows.map(r => Object.values(r));
  }
}

const DB = {
  prepare: (sql) => new D1Stmt(sql),
  async batch(stmts) {
    db.exec("BEGIN");
    try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec("COMMIT"); return out; }
    catch (e) { db.exec("ROLLBACK"); throw e; }
  },
  async exec(sql) { db.exec(sql); return { count: 1, duration: 0 }; },
};

export const env = {
  DB,
  NEO_UPDATER_TOKEN: "",
  SYNC_TOKEN: "harness-sync-token",
  NEO_GITHUB_REPOSITORY: "1510952971/neo-ledger",
  AUTH_PUBLIC_ORIGIN: "",
  NEO_TRUSTED_AUTH_HEADERS: "false",
  NEO_TRUSTED_AUTH_SECRET: "",
  NEO_TRUSTED_AUTH_AUDIENCE: "neo-ledger",
  NEO_TRUSTED_PROXY_IPS: "",
  NEO_HSTS: "false",
  DEPLOYMENT_MODE: "local",
  WECHAT_APP_ID: "",
  WECHAT_APP_SECRET: "",
  ALIPAY_APP_ID: "",
  ALIPAY_PRIVATE_KEY: "",
  ALIPAY_PUBLIC_KEY: "",
};
