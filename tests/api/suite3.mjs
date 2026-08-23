import { describe, check, call, summary } from "./lib.mjs";
process.env.TZ = "Asia/Shanghai";
const dbmod = await import("../../db/index.ts");
await dbmod.ensureDb();
const B = dbmod.getDbBinding();
const q = async (sql, ...p) => (await B.prepare(sql).bind(...p).all()).results;
const fs = await import("node:fs");

const restore = await import("../../app/api/data/restore/route.ts");
const exportApi = await import("../../app/api/data/export/route.ts");
const auth = await import("../../app/api/auth/route.ts");
const authLib = await import("../../app/auth.ts");
const ledgers = await import("../../app/api/ledgers/route.ts");
const accounts = await import("../../app/api/accounts/route.ts");
const webdav = await import("../../app/api/webdav-sync/route.ts");
const billImport = await import("../../app/api/bill-import/route.ts");
const prefs = await import("../../app/api/preferences/route.ts");
const sessionsApi = await import("../../app/api/security/sessions/route.ts");
const auditApi = await import("../../app/api/security/audit/route.ts");
const reconciliationApi = await import("../../app/api/transactions/reconciliation/route.ts");
const bulkTransactionsApi = await import("../../app/api/transactions/bulk/route.ts");
const rulesApi = await import("../../app/api/automation/rules/route.ts");
const pendingApi = await import("../../app/api/pending-transactions/route.ts");
const mfaApi = await import("../../app/api/auth/mfa/route.ts");
const passkeysApi = await import("../../app/api/auth/passkeys/route.ts");
const transactionQueryApi = await import("../../app/api/transactions/query/route.ts");
const transactionSummaryApi = await import("../../app/api/transactions/summary/route.ts");
const aiChatApi = await import("../../app/api/v1/ai/chat/route.ts");
const { totpCodeAt } = await import("../../app/totp.ts");
const passkeyChallenges = await import("../../app/passkey-challenge.ts");
const restoreSnapshot = await import("../../app/restore-snapshot.ts");

describe("Passkey 挑战防重放");
const challengeNow = Date.parse("2026-08-17T00:00:00Z");
const registrationChallengeId = await passkeyChallenges.storePasskeyChallenge({ userId: "passkey-user", purpose: "registration", challenge: "registration-challenge", now: challengeNow });
check("注册挑战绑定用户和用途", await passkeyChallenges.consumePasskeyChallenge({ id: registrationChallengeId, userId: "passkey-user", purpose: "registration", now: challengeNow + 1 }) === "registration-challenge");
check("Passkey挑战只能消费一次", await passkeyChallenges.consumePasskeyChallenge({ id: registrationChallengeId, userId: "passkey-user", purpose: "registration", now: challengeNow + 2 }) === null);
const expiredChallengeId = await passkeyChallenges.storePasskeyChallenge({ purpose: "authentication", challenge: "expired", now: challengeNow });
check("过期Passkey挑战消费失败", await passkeyChallenges.consumePasskeyChallenge({ id: expiredChallengeId, purpose: "authentication", now: challengeNow + 5 * 60_000 }) === null);

describe("恢复操作锁");
const lockNow = Date.parse("2026-08-19T00:00:00Z");
const firstRestoreLock = await restoreSnapshot.acquireRestoreLock("lock-test-owner", lockNow);
const secondRestoreLock = await restoreSnapshot.acquireRestoreLock("lock-test-owner", lockNow + 1);
check("同一 owner 的恢复锁拒绝并发获取", Boolean(firstRestoreLock?.lockId) && secondRestoreLock === null, JSON.stringify({ firstRestoreLock, secondRestoreLock }));
await restoreSnapshot.releaseRestoreLock("lock-test-owner", firstRestoreLock?.lockId ?? "");
const thirdRestoreLock = await restoreSnapshot.acquireRestoreLock("lock-test-owner", lockNow + 2);
check("释放后恢复锁可重新获取", Boolean(thirdRestoreLock?.lockId), JSON.stringify(thirdRestoreLock));
await restoreSnapshot.releaseRestoreLock("lock-test-owner", thirdRestoreLock?.lockId ?? "");
const staleRestoreLock = await restoreSnapshot.acquireRestoreLock("expired-lock-owner", lockNow);
const recoveredRestoreLock = await restoreSnapshot.acquireRestoreLock("expired-lock-owner", lockNow + 10 * 60_000 + 1);
check("过期恢复锁可回收", Boolean(staleRestoreLock?.lockId) && Boolean(recoveredRestoreLock?.lockId), JSON.stringify({ staleRestoreLock, recoveredRestoreLock }));
await restoreSnapshot.releaseRestoreLock("expired-lock-owner", recoveredRestoreLock?.lockId ?? "");

describe("AI 对话请求边界");
const aiBoundaryResponse = await call(aiChatApi, "POST", "/api/v1/ai/chat", { body: { ledgerId: 0, message: { text: "不是字符串" } } });
check("AI 拒绝非法账本和问题字段", aiBoundaryResponse.status === 400, `${aiBoundaryResponse.status} ${aiBoundaryResponse.text?.slice(0,120)}`);

describe("数据恢复回环");
const snapshot = JSON.parse(fs.readFileSync(process.env.NL_SNAPSHOT, "utf8"));
let r = await call(restore, "POST", "/api/data/restore", { body: snapshot });
check("POST 恢复套件1导出的备份", r.status === 200, `${r.status} ${r.text?.slice(0,200)}`);
const beforeRestoreSnapshotId = r.json?.beforeSnapshot?.id;
check("恢复前自动创建快照", r.status === 200 && beforeRestoreSnapshotId, r.text?.slice(0,180));
check("恢复返回可解释的数据摘要", r.status === 200 && r.json?.summary?.totalRecords >= 4 && r.json?.summary?.errorCount === 0 && /^[a-f0-9]{64}$/.test(r.json?.summary?.planChecksum ?? ""), r.text?.slice(0,220));
check("恢复成功后清理暂存计划", (await q("SELECT COUNT(*) n FROM restore_staging"))[0]?.n === 0 && (await q("SELECT COUNT(*) n FROM restore_staging_chunks"))[0]?.n === 0, r.text?.slice(0,180));
const stagingProbe = await restoreSnapshot.createRestoreStaging("local", JSON.stringify({ version: 23, ledgers: [], accounts: [], transactions: [] }));
const stagedProbe = await restoreSnapshot.loadRestoreStaging("local", stagingProbe.id);
check("恢复暂存读取提交标记后的计划", stagedProbe.version === 23, stagingProbe.id);
await B.prepare("UPDATE restore_staging_chunks SET payload=? WHERE staging_id=?").bind("tampered", stagingProbe.id).run();
let tamperedStagingRejected = false;
try { await restoreSnapshot.loadRestoreStaging("local", stagingProbe.id); } catch { tamperedStagingRejected = true; }
check("恢复暂存篡改会被校验拒绝", tamperedStagingRejected, stagingProbe.id);
await restoreSnapshot.deleteRestoreStaging("local", stagingProbe.id);
const executedRestorePlanChecksum = r.json?.summary?.planChecksum;
const txN = (await q("SELECT COUNT(*) n FROM transactions"))[0].n;
check("流水恢复2条", txN === 2, String(txN));
const restoredReconciliation = await q("SELECT r.status,r.note,t.title FROM transaction_reconciliation r JOIN transactions t ON t.id=r.transaction_id");
const restoredRule = await q("SELECT id,owner_id AS ownerId,conditions_json AS conditionsJson,actions_json AS actionsJson FROM automation_rules WHERE id='backup-rule'");
check("v23 恢复对账状态", restoredReconciliation.some((item) => item.status === "reconciled" && item.note === "备份回环核对"), JSON.stringify(restoredReconciliation));
check("v23 恢复规则并重映射账户", restoredRule.length === 1 && JSON.parse(restoredRule[0].conditionsJson).accountId === JSON.parse(restoredRule[0].actionsJson).accountId, JSON.stringify(restoredRule));
const acctNames = (await q("SELECT name FROM accounts ORDER BY id")).map(x => x.name);
check("账户恢复(含改名后的工资卡改)", acctNames.includes("工资卡改") && acctNames.includes("信用卡"), JSON.stringify(acctNames));
const bal = (await q("SELECT current_balance b FROM accounts WHERE name='工资卡改'"))[0]?.b;
check("余额恢复精确一致", bal === 1200000 - 3550 + 888888 - 3050 - 30000 - 100, String(bal));
r = await call(exportApi, "GET", "/api/data/export");
check("恢复后再导出成功", r.status === 200 && r.json?.transactions?.length === 2, `tx=${r.json?.transactions?.length}`);
r = await call(restore, "POST", "/api/data/restore", { body: { hello: "不是备份" } });
check("非法备份被拒", r.status >= 400, `${r.status} ${r.text?.slice(0,120)}`);

describe("注册/登录");
r = await call(auth, "POST", "/api/auth", { body: { action: "register", username: "pengtest", password: "Secret#12345", displayName: "小彭" } });
check("注册首个账号", r.status === 200 || r.status === 201, `${r.status} ${r.text?.slice(0,150)}`);
const setCookie = r.headers?.get?.("set-cookie") || "";
const cookie = setCookie.split(";")[0];
check("下发会话Cookie", cookie.includes("="), setCookie.slice(0,80));
r = await call(auth, "GET", "/api/auth", { cookie });
check("GET 会话信息", r.status === 200 && (r.text.includes("pengtest") || r.text.includes("小彭")), r.text?.slice(0,150));
r = await call(auth, "POST", "/api/auth", { body: { action: "login", username: "pengtest", password: "错的密码" } });
check("错误密码被拒", r.status === 401 || r.status === 400, `${r.status}`);
r = await call(auth, "POST", "/api/auth", { body: { action: "register", username: "pengtest", password: "Another#123", displayName: "撞名者" } });
check("重复用户名409", r.status === 409, `${r.status} ${r.text?.slice(0,100)}`);
const crossOriginAuth = await call(auth, "POST", "/api/auth", {
  headers: { origin: "https://evil.example" },
  body: { action: "login", username: "pengtest", password: "wrong-origin-password" },
});
check(
  "认证接口拒绝跨源请求并返回403",
  crossOriginAuth.status === 403 && crossOriginAuth.json?.code === "forbidden",
  `${crossOriginAuth.status} ${crossOriginAuth.text?.slice(0,120)}`,
);

const rateLimitHeaders = { "x-forwarded-for": "198.51.100.77" };
const authWindowStart = Math.floor(Date.now() / 900_000);
await B.prepare("INSERT OR REPLACE INTO api_rate_limits(owner_id,scope,window_start,count) VALUES(?,?,?,?)")
  .bind("auth:cleanup-proof", "auth:login", authWindowStart - 97, 9)
  .run();
await authLib.enforceAuthRateLimit(new Request("https://ledger.example.com/api/auth", { headers: { "x-forwarded-for": "198.51.100.78" } }), "login");
check(
  "认证限流桶自动清理超过24小时的历史窗口",
  (await q("SELECT COUNT(*) n FROM api_rate_limits WHERE owner_id='auth:cleanup-proof'"))[0]?.n === 0,
  JSON.stringify(await q("SELECT owner_id,scope,window_start FROM api_rate_limits WHERE owner_id='auth:cleanup-proof'")),
);
const authRateLimitStatuses = [];
for (let index = 0; index < 13; index += 1) {
  const attempt = await call(auth, "POST", "/api/auth", {
    headers: rateLimitHeaders,
    body: { action: "login", username: "pengtest", password: "wrong-rate-limit-password" },
  });
  authRateLimitStatuses.push(attempt);
}
const rateLimitedAttempt = authRateLimitStatuses.at(-1);
check(
  "认证限流返回标准429与Retry-After",
  authRateLimitStatuses.slice(0, 12).every((attempt) => attempt.status === 401) &&
    rateLimitedAttempt?.status === 429 &&
    Number(rateLimitedAttempt.headers?.get?.("retry-after")) > 0 &&
    rateLimitedAttempt.json?.code === "rate_limited",
  String(rateLimitedAttempt?.status) + " " + String(rateLimitedAttempt?.text?.slice(0, 140)),
);
describe("注册后鉴权边界");
r = await call(ledgers, "GET", "/api/ledgers", {
  headers: { "oai-authenticated-user-email": "victim@example.com" },
});
check("伪造身份请求头不能冒充用户", r.status === 401, String(r.status));
{
  const secret = "trusted-proxy-test-secret-at-least-32-bytes";
  const audience = "neo-ledger-test";
  const signedHeaders = async (nonce, timestamp = String(Math.floor(Date.now() / 1000)), source = "203.0.113.10") => {
    const email = "gateway-user@example.com";
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${email}\n${audience}\n${timestamp}\n${nonce}`))).toString("base64url");
    return { "oai-authenticated-user-email": email, "x-neo-auth-signature": digest, "x-neo-auth-timestamp": timestamp, "x-neo-auth-nonce": nonce, "x-neo-auth-audience": audience, "x-real-ip": source };
  };
  const { env: workerEnv } = await import("cloudflare:workers");
  Object.assign(workerEnv, { NEO_TRUSTED_AUTH_HEADERS: "true", NEO_TRUSTED_AUTH_SECRET: secret, NEO_TRUSTED_AUTH_AUDIENCE: audience, NEO_TRUSTED_PROXY_IPS: "203.0.113.10" });
  const valid = await signedHeaders("valid-nonce-value-0001");
  r = await call(ledgers, "GET", "/api/ledgers", { headers: valid });
  check("可信代理正确签名被接受", r.status === 200, `${r.status} ${r.text?.slice(0,120)}`);
  r = await call(ledgers, "GET", "/api/ledgers", { headers: valid });
  check("可信代理 nonce 重放被拒", r.status === 401, String(r.status));
  const expired = await signedHeaders("expired-nonce-value-01", String(Math.floor(Date.now() / 1000) - 600));
  r = await call(ledgers, "GET", "/api/ledgers", { headers: expired });
  check("可信代理过期时间戳被拒", r.status === 401, String(r.status));
  const wrongSource = await signedHeaders("source-nonce-value-0001", undefined, "203.0.113.11");
  r = await call(ledgers, "GET", "/api/ledgers", { headers: wrongSource });
  check("非白名单代理来源被拒", r.status === 401, String(r.status));
  const badSignature = { ...(await signedHeaders("bad-signature-nonce1")), "x-neo-auth-signature": "invalid" };
  r = await call(ledgers, "GET", "/api/ledgers", { headers: badSignature });
  check("错误代理签名被拒", r.status === 401, String(r.status));
  Object.assign(workerEnv, { NEO_TRUSTED_AUTH_HEADERS: "false", NEO_TRUSTED_AUTH_SECRET: "", NEO_TRUSTED_AUTH_AUDIENCE: "neo-ledger", NEO_TRUSTED_PROXY_IPS: "" });
}
r = await call(ledgers, "GET", "/api/ledgers");
check("无Cookie访问被拒(localhost回退关闭)", r.status === 401, `${r.status} ${r.text?.slice(0,100)}`);
r = await call(ledgers, "GET", "/api/ledgers", { cookie });
check("带Cookie访问正常", r.status === 200 && Array.isArray(r.json), `${r.status}`);
check("旧local数据已过户给首个账号", r.json?.length >= 1, JSON.stringify(r.json)?.slice(0,120));
const L = r.json?.[0]?.id;
r = await call(accounts, "GET", `/api/accounts?ledger=${L}`, { cookie });
check("过户后账户可见", r.status === 200 && r.json?.length >= 2, `${r.status} n=${r.json?.length}`);
r = await call(auth, "POST", "/api/auth", { body: { action: "register", username: "ledgerboundary", password: "Secret#98765", displayName: "边界用户" } });
const boundaryCookie = (r.headers?.get?.("set-cookie") || "").split(";")[0];
check("创建第二个边界测试用户", r.status === 200 && boundaryCookie.includes("="), `${r.status}`);
const crossUserAccounts = await call(accounts, "GET", `/api/accounts?ledger=${L}`, { cookie: boundaryCookie });
check("第二个用户不能遍历第一个用户账本", crossUserAccounts.status === 403, `${crossUserAccounts.status} ${crossUserAccounts.text?.slice(0,120)}`);
r = await call(auth, "DELETE", "/api/auth", { cookie });
check("登出", r.status === 200, `${r.status}`);
r = await call(ledgers, "GET", "/api/ledgers", { cookie });
check("登出后旧Cookie失效", r.status === 401, `${r.status}`);
r = await call(auth, "POST", "/api/auth", { body: { action: "login", username: "pengtest", password: "Secret#12345" } });
const loginResponse = r;
const cookie2 = (r.headers?.get?.("set-cookie") || "").split(";")[0];
check("重新登录成功", r.status === 200 && cookie2.includes("="), `${r.status}`);
{
  const { env: workerEnv } = await import("cloudflare:workers");
  Object.assign(workerEnv, {
    OLLAMA_URL: "http://127.0.0.1:11434",
    OLLAMA_MODEL: "test-model",
    NEO_AI_EXTERNAL_DISABLED: "true",
  });
  const originalFetch = globalThis.fetch;
  let externalFetchCalled = false;
  globalThis.fetch = async () => {
    externalFetchCalled = true;
    throw new Error("外部模型调用未被阻断");
  };
  r = await call(aiChatApi, "POST", "/api/v1/ai/chat", {
    cookie: cookie2,
    body: { ledgerId: L, message: "请分析本月支出" },
    headers: { "x-neo-ai-consent": "true" },
  });
  check(
    "管理员关闭 AI 外发后回落本地规则且不触发网络请求",
    r.status === 200 && r.json?.provider === "local-rules" && !externalFetchCalled && r.json?.answer?.includes("本地规则诊断") && !r.text?.includes("127.0.0.1"),
    `${r.status} ${r.text?.slice(0,180)}`,
  );
  globalThis.fetch = originalFetch;
  Object.assign(workerEnv, { OLLAMA_URL: "", OLLAMA_MODEL: "llama3.1:8b", NEO_AI_EXTERNAL_DISABLED: "false" });
}
r = await call(transactionQueryApi, "GET", `/api/transactions/query?ledger=${L}&limit=1`, { cookie: cookie2 });
const transactionPageOne = r.json;
check("流水游标接口返回有界首屏和总数", r.status === 200 && transactionPageOne?.items?.length === 1 && transactionPageOne?.total >= 2 && transactionPageOne?.nextCursor, `${r.status} ${r.text?.slice(0,180)}`);
check("流水游标接口同时返回筛选聚合且不受页大小影响", r.status === 200 && Number.isFinite(transactionPageOne?.income) && Number.isFinite(transactionPageOne?.expense) && transactionPageOne?.balance === transactionPageOne?.income - transactionPageOne?.expense, r.text?.slice(0,180));
r = await call(transactionQueryApi, "GET", `/api/transactions/query?ledger=${L}&id=${transactionPageOne?.items?.[0]?.id}&limit=1`, { cookie: cookie2 });
check("流水查询支持按ID安全回读历史账单", r.status === 200 && r.json?.total === 1 && r.json?.items?.[0]?.id === transactionPageOne?.items?.[0]?.id, `${r.status} ${r.text?.slice(0,160)}`);
r = await call(transactionQueryApi, "GET", `/api/transactions/query?ledger=${L}&limit=1&cursor=${encodeURIComponent(transactionPageOne?.nextCursor || "")}`, { cookie: cookie2 });
check("流水游标下一页不重复且总数稳定", r.status === 200 && r.json?.items?.length === 1 && r.json.items[0]?.id !== transactionPageOne?.items?.[0]?.id && r.json?.total === transactionPageOne?.total && r.headers?.get("cache-control")?.includes("no-store"), `${r.status} ${r.text?.slice(0,180)}`);
r = await call(transactionQueryApi, "GET", `/api/transactions/query?ledger=${L}&cursor=not-a-valid-cursor`, { cookie: cookie2 });
check("流水游标拒绝伪造值", r.status === 400, `${r.status} ${r.text?.slice(0,120)}`);
r = await call(transactionQueryApi, "GET", `/api/transactions/query?ledger=${L}&limit=101`, { cookie: cookie2 });
check("流水分页拒绝超过硬上限的页大小", r.status === 400, `${r.status} ${r.text?.slice(0,120)}`);
r = await call(transactionQueryApi, "GET", `/api/transactions/query?ledger=${L}&q=${"x".repeat(81)}`, { cookie: cookie2 });
check("流水搜索拒绝超长关键词", r.status === 400, `${r.status} ${r.text?.slice(0,120)}`);
r = await call(transactionQueryApi, "GET", `/api/transactions/query?ledger=${L}&q=${encodeURIComponent("改名账单")}`, { cookie: cookie2 });
check("流水搜索按关键词过滤且仍受账本权限保护", r.status === 200 && r.json?.items?.every?.((item) => String(item.title).includes("改名账单")) && r.json?.total >= 1, `${r.status} ${r.text?.slice(0,180)}`);
r = await call(transactionQueryApi, "GET", `/api/transactions/query?ledger=${L}&from=bad-date`, { cookie: cookie2 });
check("流水日期筛选拒绝非法日期", r.status === 400, `${r.status} ${r.text?.slice(0,120)}`);
r = await call(transactionQueryApi, "GET", `/api/transactions/query?ledger=${L}&offset=841`, { cookie: cookie2 });
check("流水查询拒绝越界时区偏移", r.status === 400, `${r.status} ${r.text?.slice(0,120)}`);
const summaryAnchor = (await q("SELECT substr(occurred_at,1,10) day FROM transactions WHERE ledger_id=? ORDER BY occurred_at DESC,id DESC LIMIT 1", L))[0]?.day;
r = await call(transactionSummaryApi, "GET", `/api/transactions/summary?ledger=${L}&today=${summaryAnchor}&dimension=月&now=${encodeURIComponent(`${summaryAnchor}T12:00:00.000Z`)}`, { cookie: cookie2 });
check("流水摘要服务端聚合并返回稳定统计结构", r.status === 200 && r.json?.analysis && Number.isFinite(r.json.analysis.incomeTotal) && Number.isFinite(r.json.analysis.expenseTotal) && Array.isArray(r.json.analysis.trend) && r.json?.periodReports?.daily?.count >= 0 && Number.isFinite(r.json?.dashboard?.monthExpense) && Array.isArray(r.json?.dashboard?.settlements), `${r.status} ${r.text?.slice(0,220)}`);
const expectedMonth = (await q("SELECT COALESCE(SUM(CASE WHEN type='收入' THEN amount*(CASE currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN 0.0462 WHEN 'EUR' THEN 7.85 ELSE 1 END) ELSE 0 END),0) income, COALESCE(SUM(CASE WHEN type='支出' THEN amount*(CASE currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN 0.0462 WHEN 'EUR' THEN 7.85 ELSE 1 END) ELSE 0 END),0) expense FROM transactions WHERE ledger_id=? AND substr(occurred_at,1,7)=?", L, summaryAnchor?.slice(0,7)))[0];
check("流水摘要金额与账本聚合基线一致", r.status === 200 && Math.abs(Number(r.json?.analysis?.incomeTotal) - Number(expectedMonth?.income ?? 0)) < 0.001 && Math.abs(Number(r.json?.analysis?.expenseTotal) - Number(expectedMonth?.expense ?? 0)) < 0.001, `${r.status} ${r.text?.slice(0,220)}`);
r = await call(transactionSummaryApi, "GET", `/api/transactions/summary?ledger=${L}&today=${summaryAnchor}&dimension=周`, { cookie: cookie2 });
check("流水摘要拒绝非法维度", r.status === 400, `${r.status} ${r.text?.slice(0,120)}`);
r = await call(transactionSummaryApi, "GET", `/api/transactions/summary?ledger=${L}&today=${summaryAnchor}&dimension=月`, { cookie: boundaryCookie });
check("流水摘要遵守账本归属边界", r.status === 403, `${r.status} ${r.text?.slice(0,120)}`);
const orphanLedgerInsert = await B.prepare("INSERT INTO ledgers(name,icon,owner_id) VALUES(?,?,NULL)").bind("未归属隔离测试", "🧪").run();
const orphanLedgerId = Number(orphanLedgerInsert.meta.last_row_id);
const orphanAccountInsert = await B.prepare("INSERT INTO accounts(ledger_id,name,type,current_balance,currency,asset_class,uuid,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(orphanLedgerId, "孤立账户", "资产", 10000, "CNY", "现金流", "orphan-export-account", new Date().toISOString()).run();
const orphanAccountId = Number(orphanAccountInsert.meta.last_row_id);
const orphanTransactionInsert = await B.prepare("INSERT INTO transactions(ledger_id,title,amount,type,account_id,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,occurred_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(orphanLedgerId, "孤立流水", 1234, "支出", orphanAccountId, "CNY", 1234, "CNY", 1000000, "Asia/Shanghai", new Date().toISOString(), new Date().toISOString()).run();
const orphanTransactionId = Number(orphanTransactionInsert.meta.last_row_id);
await B.prepare("INSERT INTO account_transfers(uuid,ledger_id,kind,from_account_id,amount,currency,occurred_at,note) VALUES(?,?,?,?,?,?,?,?)").bind("orphan-export-transfer", orphanLedgerId, "余额调账", orphanAccountId, 100, "CNY", new Date().toISOString(), "孤立转账").run();
await B.prepare("INSERT INTO transaction_reconciliation(transaction_id,ledger_id,status,note) VALUES(?,?,?,?)").bind(orphanTransactionId, orphanLedgerId, "reconciled", "孤立对账").run();
await B.prepare("INSERT INTO sync_tombstones(entity_type,entity_uuid,ledger_id,deleted_at) VALUES(?,?,?,?)").bind("transaction", "orphan-export-tombstone", orphanLedgerId, new Date().toISOString()).run();
const ownedLedgerResponse = await call(ledgers, "GET", "/api/ledgers", { cookie: cookie2 });
check("账本列表不会隐式认领未归属账本", ownedLedgerResponse.status === 200 && !ownedLedgerResponse.json?.some?.((item) => item.id === orphanLedgerId), JSON.stringify(ownedLedgerResponse.json));
const exportedIsolation = await call(exportApi, "GET", "/api/data/export", { cookie: cookie2 });
check("数据导出不会带出未归属账本", exportedIsolation.status === 200 && !exportedIsolation.json?.ledgers?.some?.((item) => item.id === orphanLedgerId), exportedIsolation.text?.slice(0,180));
check("数据导出不会带出孤立账本的子表数据", exportedIsolation.status === 200 &&
  !exportedIsolation.json?.accounts?.some?.((item) => item.id === orphanAccountId) &&
  !exportedIsolation.json?.transactions?.some?.((item) => item.id === orphanTransactionId) &&
  !exportedIsolation.json?.accountTransfers?.some?.((item) => item.uuid === "orphan-export-transfer") &&
  !exportedIsolation.json?.transactionReconciliation?.some?.((item) => item.transactionId === orphanTransactionId) &&
  !exportedIsolation.json?.syncTombstones?.some?.((item) => item.entityUuid === "orphan-export-tombstone"), exportedIsolation.text?.slice(0,220));
check("JSON财务导出禁止缓存", exportedIsolation.headers?.get?.("cache-control")?.includes("no-store") && exportedIsolation.headers?.get?.("content-disposition")?.includes("attachment"), exportedIsolation.headers);
const csvExportIsolation = await call(exportApi, "GET", "/api/data/export?format=csv", { cookie: cookie2 });
check("CSV财务导出禁止缓存并阻止嗅探", csvExportIsolation.status === 200 && csvExportIsolation.headers?.get?.("cache-control")?.includes("no-store") && csvExportIsolation.headers?.get?.("x-content-type-options") === "nosniff", csvExportIsolation.headers);
const orphanAccountsResponse = await call(accounts, "GET", `/api/accounts?ledger=${orphanLedgerId}`, { cookie: cookie2 });
check("已登录用户不能通过账本ID认领孤立账本", orphanAccountsResponse.status >= 400, `${orphanAccountsResponse.status} ${orphanAccountsResponse.text?.slice(0,140)}`);
const orphanOwner = await q("SELECT owner_id ownerId FROM ledgers WHERE id=?", orphanLedgerId);
check("未归属账本仍保持未归属", orphanOwner[0]?.ownerId == null, JSON.stringify(orphanOwner));
await B.prepare("DELETE FROM transaction_reconciliation WHERE transaction_id=?").bind(orphanTransactionId).run();
await B.prepare("DELETE FROM sync_tombstones WHERE entity_uuid=?").bind("orphan-export-tombstone").run();
await B.prepare("DELETE FROM account_transfers WHERE uuid=?").bind("orphan-export-transfer").run();
await B.prepare("DELETE FROM transactions WHERE id=?").bind(orphanTransactionId).run();
await B.prepare("DELETE FROM accounts WHERE id=?").bind(orphanAccountId).run();
await B.prepare("DELETE FROM ledgers WHERE id=? AND owner_id IS NULL").bind(orphanLedgerId).run();
const snapshotListResponse = await call(restore, "GET", "/api/data/restore", { cookie: cookie2 });
check("账号过户后仍可读取恢复前快照", snapshotListResponse.status === 200 && snapshotListResponse.json?.some?.((item) => item.id === beforeRestoreSnapshotId), snapshotListResponse.text?.slice(0,180));
const restoreOwnerId = (await q("SELECT id FROM app_users WHERE username=?", "pengtest"))[0]?.id;
const incompleteSnapshotId = crypto.randomUUID();
await B.prepare("INSERT INTO restore_snapshots(id,owner_id,checksum,total_bytes,chunk_count) VALUES(?,?,?,?,?)")
  .bind(incompleteSnapshotId, "user:" + restoreOwnerId, "incomplete", 12, 1)
  .run();
const incompleteSnapshotList = await call(restore, "GET", "/api/data/restore", { cookie: cookie2 });
check("未提交完成的恢复快照不会出现在列表", incompleteSnapshotList.status === 200 && !incompleteSnapshotList.json?.some?.((item) => item.id === incompleteSnapshotId), incompleteSnapshotList.text?.slice(0,180));
await B.prepare("DELETE FROM restore_snapshots WHERE id=?").bind(incompleteSnapshotId).run();
const dryRunRestore = structuredClone(snapshot);
dryRunRestore.dryRun = true;
const beforeDryRun = await q("SELECT COUNT(*) n FROM ledgers UNION ALL SELECT COUNT(*) FROM accounts UNION ALL SELECT COUNT(*) FROM transactions");
r = await call(restore, "POST", "/api/data/restore", { cookie: cookie2, body: dryRunRestore });
const afterDryRun = await q("SELECT COUNT(*) n FROM ledgers UNION ALL SELECT COUNT(*) FROM accounts UNION ALL SELECT COUNT(*) FROM transactions");
check("恢复预检与执行计划指纹一致且不改写主库", r.status === 200 && r.json?.dryRun === true && Number(r.json?.summary?.estimatedStatements) > 0 && r.json?.summary?.planChecksum === executedRestorePlanChecksum && !r.json?.beforeSnapshot && JSON.stringify(afterDryRun) === JSON.stringify(beforeDryRun), `${r.status} exec=${executedRestorePlanChecksum} dry=${r.json?.summary?.planChecksum} ${r.text?.slice(0,160)}`);
const matchingPreflight = await call(restore, "POST", "/api/data/restore", { cookie: cookie2, headers: { "X-Restore-Dry-Run": "1", "X-Restore-Plan-Checksum": executedRestorePlanChecksum }, body: snapshot });
check("恢复执行接受匹配的预检指纹", matchingPreflight.status === 200 && matchingPreflight.json?.summary?.planChecksum === executedRestorePlanChecksum && matchingPreflight.json?.dryRun === true, `${matchingPreflight.status} ${matchingPreflight.text?.slice(0,160)}`);
const mismatchedPreflight = await call(restore, "POST", "/api/data/restore", { cookie: cookie2, headers: { "X-Restore-Plan-Checksum": "0".repeat(64) }, body: snapshot });
check("恢复拒绝不匹配的预检指纹", mismatchedPreflight.status === 409 && /重新执行预检/u.test(mismatchedPreflight.text), `${mismatchedPreflight.status} ${mismatchedPreflight.text?.slice(0,160)}`);
const invalidSchemaRestore = structuredClone(snapshot);
invalidSchemaRestore.transactions[0].type = "未知流水类型";
const beforeInvalidRestore = await q("SELECT COUNT(*) n FROM ledgers UNION ALL SELECT COUNT(*) FROM accounts UNION ALL SELECT COUNT(*) FROM transactions");
r = await call(restore, "POST", "/api/data/restore", { cookie: cookie2, body: invalidSchemaRestore });
const afterInvalidRestore = await q("SELECT COUNT(*) n FROM ledgers UNION ALL SELECT COUNT(*) FROM accounts UNION ALL SELECT COUNT(*) FROM transactions");
check("恢复前拒绝无效流水枚举且不改变主库", r.status >= 400 && JSON.stringify(afterInvalidRestore) === JSON.stringify(beforeInvalidRestore), `${r.status} ${r.text?.slice(0,160)}`);
const atomicFailureRestore = structuredClone(snapshot);
atomicFailureRestore.crdtTombstones = [
  { crdtId: "restore-duplicate-crdt", ledgerId: atomicFailureRestore.ledgers[0].id, deletedAt: "2026-08-19T00:00:00.000Z" },
  { crdtId: "restore-duplicate-crdt", ledgerId: atomicFailureRestore.ledgers[0].id, deletedAt: "2026-08-19T00:00:01.000Z" },
];
const beforeAtomicRestore = await q("SELECT COUNT(*) n FROM ledgers UNION ALL SELECT COUNT(*) FROM accounts UNION ALL SELECT COUNT(*) FROM transactions");
r = await call(restore, "POST", "/api/data/restore", { cookie: cookie2, body: atomicFailureRestore });
const afterAtomicRestore = await q("SELECT COUNT(*) n FROM ledgers UNION ALL SELECT COUNT(*) FROM accounts UNION ALL SELECT COUNT(*) FROM transactions");
check("恢复批量写入失败时事务回滚且不留下半恢复状态", r.status >= 400 && JSON.stringify(afterAtomicRestore) === JSON.stringify(beforeAtomicRestore), `${r.status} ${r.text?.slice(0,160)}`);
const duplicateIdRestore = structuredClone(snapshot);
duplicateIdRestore.accounts[1].id = duplicateIdRestore.accounts[0].id;
const beforeDuplicateIdRestore = await q("SELECT COUNT(*) n FROM ledgers UNION ALL SELECT COUNT(*) FROM accounts UNION ALL SELECT COUNT(*) FROM transactions");
r = await call(restore, "POST", "/api/data/restore", { cookie: cookie2, body: duplicateIdRestore });
const afterDuplicateIdRestore = await q("SELECT COUNT(*) n FROM ledgers UNION ALL SELECT COUNT(*) FROM accounts UNION ALL SELECT COUNT(*) FROM transactions");
check("恢复前拒绝重复账户编号且不创建快照或改写主库", r.status >= 400 && JSON.stringify(afterDuplicateIdRestore) === JSON.stringify(beforeDuplicateIdRestore), `${r.status} ${r.text?.slice(0,160)}`);
const heldRestoreLock = await restoreSnapshot.acquireRestoreLock(`user:${restoreOwnerId}`, Date.now());
r = await call(restore, "POST", "/api/data/restore", { cookie: cookie2, body: snapshot });
check("恢复锁占用时拒绝并发恢复", Boolean(heldRestoreLock?.lockId) && r.status === 409, `${r.status} ${r.text?.slice(0,160)}`);
await restoreSnapshot.releaseRestoreLock(`user:${restoreOwnerId}`, heldRestoreLock?.lockId ?? "");

describe("Passkey 安全边界");
r = await call(passkeysApi, "POST", "/api/auth/passkeys", { raw: "[\"not-an-object\"]" });
check("Passkey 拒绝非对象请求体", r.status === 400, `${r.status} ${r.text?.slice(0,120)}`);
r = await call(passkeysApi, "POST", "/api/auth/passkeys", { raw: "{" });
check("Passkey 拒绝畸形 JSON", r.status === 400, `${r.status} ${r.text?.slice(0,120)}`);
r = await call(passkeysApi, "POST", "/api/auth/passkeys", { raw: "x".repeat(128 * 1024 + 1) });
check("Passkey 请求体超过硬上限时被拒", r.status === 413, `${r.status} ${r.text?.slice(0,120)}`);
r = await call(passkeysApi, "POST", "/api/auth/passkeys", { body: { action: "begin-registration" } });
check("未登录不能注册Passkey", r.status === 401, `${r.status} ${r.text?.slice(0,120)}`);
r = await call(passkeysApi, "POST", "http://ledger.example.com/api/auth/passkeys", { body: { action: "begin-authentication" } });
check("非本机HTTP拒绝Passkey", r.status >= 400, `${r.status} ${r.text?.slice(0,120)}`);
r = await call(passkeysApi, "POST", "/api/auth/passkeys", { body: { action: "begin-authentication" } });
check("匿名用户可获取可发现凭据挑战且响应禁止缓存", r.status === 200 && r.json?.challengeId && r.json?.options?.challenge && r.headers.get("cache-control") === "no-store, private, max-age=0", `${r.status} ${r.text?.slice(0,160)}`);
const replayChallengeId = r.json?.challengeId;
r = await call(passkeysApi, "POST", "/api/auth/passkeys", { cookie: cookie2, body: { action: "finish-authentication", challengeId: "not-a-uuid", response: { id: "missing", rawId: "missing", type: "public-key", response: {} } } });
check("Passkey拒绝伪造挑战标识", r.status === 400, `${r.status} ${r.text?.slice(0,120)}`);
r = await call(passkeysApi, "POST", "/api/auth/passkeys", { body: { action: "finish-authentication", challengeId: replayChallengeId, response: { id: "missing", rawId: "missing", type: "public-key", response: {} } } });
check("无效凭据不能登录", r.status >= 400, `${r.status}`);
r = await call(passkeysApi, "POST", "/api/auth/passkeys", { body: { action: "finish-authentication", challengeId: replayChallengeId, response: { id: "missing", rawId: "missing", type: "public-key", response: {} } } });
check("登录挑战消费后不可重放", r.status === 400, `${r.status} ${r.text?.slice(0,120)}`);
const disabledPasskeyUserId = "disabled-passkey-user";
await B.prepare("INSERT OR IGNORE INTO app_users(id,username,display_name,password_hash,password_salt,password_iterations,disabled) VALUES(?,?,?,?,?,?,1)")
  .bind(disabledPasskeyUserId, "disabled-passkey-user", "已停用用户", "hash", "salt", 240000)
  .run();
await B.prepare("INSERT OR REPLACE INTO user_passkeys(id,user_id,label,public_key,counter,device_type,backed_up,transports) VALUES(?,?,?,?,0,'singleDevice',0,'[]')")
  .bind("disabled-passkey", disabledPasskeyUserId, "停用账号设备", "cHVibGlj")
  .run();
const disabledPasskeyHeaders = { "x-forwarded-for": "198.51.100.99" };
const disabledAuthChallenge = await call(passkeysApi, "POST", "/api/auth/passkeys", { headers: disabledPasskeyHeaders, body: { action: "begin-authentication" } });
const sessionsBeforeDisabledPasskey = (await q("SELECT COUNT(*) n FROM app_sessions WHERE user_id=?", disabledPasskeyUserId))[0]?.n ?? 0;
r = await call(passkeysApi, "POST", "/api/auth/passkeys", {
  headers: disabledPasskeyHeaders,
  body: {
    action: "finish-authentication",
    challengeId: disabledAuthChallenge.json?.challengeId,
    response: { id: "disabled-passkey", rawId: "disabled-passkey", type: "public-key", response: {} },
  },
});
const sessionsAfterDisabledPasskey = (await q("SELECT COUNT(*) n FROM app_sessions WHERE user_id=?", disabledPasskeyUserId))[0]?.n ?? 0;
check("停用账号的 Passkey 不得建立会话", r.status >= 400 && sessionsAfterDisabledPasskey === sessionsBeforeDisabledPasskey && /不存在|撤销/u.test(r.text), `${r.status} ${r.text?.slice(0,160)}`);
const currentUserId = (await q("SELECT id FROM app_users WHERE username='pengtest'"))[0]?.id;
const otherUserId = "other-user-boundary";
await B.prepare("INSERT INTO user_passkeys(id,user_id,label,public_key,counter,device_type,backed_up,transports) VALUES(?,?,?,?,0,'singleDevice',0,'[]')").bind("owned-passkey", currentUserId, "我的设备", "cHVibGlj").run();
await B.prepare("INSERT INTO user_passkeys(id,user_id,label,public_key,counter,device_type,backed_up,transports) VALUES(?,?,?,?,0,'singleDevice',0,'[]')").bind("other-passkey", otherUserId, "其他用户设备", "c2VjcmV0").run();
r = await call(passkeysApi, "GET", "/api/auth/passkeys", { cookie: cookie2 });
check("Passkey列表不返回公钥且响应禁止缓存", r.status === 200 && r.json?.some?.((item) => item.id === "owned-passkey") && !r.text.includes("publicKey") && !r.text.includes("cHVibGlj") && r.headers.get("cache-control") === "no-store, private, max-age=0" && Number(r.headers.get("x-total-count")) >= r.json.length && ["0", "1"].includes(r.headers.get("x-has-more") || ""), `${r.status} ${r.text?.slice(0,180)}`);
r = await call(passkeysApi, "DELETE", "/api/auth/passkeys", { cookie: cookie2, body: { id: "other-passkey" } });
check("不能撤销其他用户Passkey", r.status === 404 && (await q("SELECT id FROM user_passkeys WHERE id='other-passkey'")).length === 1, `${r.status}`);
r = await call(passkeysApi, "DELETE", "/api/auth/passkeys", { cookie: cookie2, body: { id: "owned-passkey" } });
check("用户可撤销自己的Passkey", r.status === 200 && (await q("SELECT id FROM user_passkeys WHERE id='owned-passkey'")).length === 0, `${r.status}`);

describe("账号头像");
{
  const imageData = (mime, bytes) =>
    `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  const pngAvatar = imageData("image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpegAvatar = imageData("image/jpeg", [0xff, 0xd8, 0xff, 0xd9]);
  const jpegAvatar2 = imageData("image/jpeg", [0xff, 0xd8, 0xff, 0x01, 0xd9]);
  const webpAvatar = imageData("image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

  const schemaVersion = await q("SELECT value FROM app_meta WHERE key='schema_version'");
  const userColumns = await q("PRAGMA table_info(app_users)");
  check("数据库迁移到 32", schemaVersion[0]?.value === "32", JSON.stringify(schemaVersion));
  const expectedIndexes = await q("SELECT name FROM sqlite_master WHERE type='index' AND name IN ('transactions_ledger_occurred_idx','accounts_ledger_id_idx','subscriptions_ledger_charge_idx','pending_transactions_ledger_status_idx')");
  check("核心账本查询索引已创建", expectedIndexes.length === 4, JSON.stringify(expectedIndexes));
  const planLedgerId = (await q("SELECT id FROM ledgers WHERE owner_id=? ORDER BY id LIMIT 1", "user:" + (await q("SELECT id FROM app_users WHERE username='pengtest'")).at(0)?.id))[0]?.id;
  const transactionPlan = await q("EXPLAIN QUERY PLAN SELECT id FROM transactions WHERE ledger_id=? ORDER BY occurred_at DESC,id DESC", planLedgerId);
  const summaryPlan = await q("EXPLAIN QUERY PLAN SELECT COALESCE(SUM(amount),0) FROM transactions WHERE ledger_id=? AND occurred_at>=? AND occurred_at<? AND date(datetime(occurred_at,'+480 minutes'))=?", planLedgerId, "2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z", "2026-01-01");
  const accountPlan = await q("EXPLAIN QUERY PLAN SELECT id FROM accounts WHERE ledger_id=? ORDER BY id", planLedgerId);
  const subscriptionPlan = await q("EXPLAIN QUERY PLAN SELECT id FROM subscriptions WHERE ledger_id=? ORDER BY next_charge_date,id", planLedgerId);
  check("流水查询计划使用账本时间索引", transactionPlan.some((row) => String(row.detail ?? "").includes("transactions_ledger_occurred_idx")), JSON.stringify(transactionPlan));
  check("摘要查询计划可复用账本时间索引", summaryPlan.some((row) => String(row.detail ?? "").includes("transactions_ledger_occurred_idx")), JSON.stringify(summaryPlan));
  check("账户查询计划使用账本索引", accountPlan.some((row) => String(row.detail ?? "").includes("accounts_ledger_id_idx")), JSON.stringify(accountPlan));
  check("订阅查询计划使用账本扣款索引", subscriptionPlan.some((row) => String(row.detail ?? "").includes("subscriptions_ledger_charge_idx")), JSON.stringify(subscriptionPlan));
  check("app_users 已有头像列", userColumns.some((column) => column.name === "avatar_url"), JSON.stringify(userColumns));
  check("登录响应返回空头像", loginResponse.json?.user?.avatarUrl === null, loginResponse.text);

  r = await call(auth, "PATCH", "/api/auth", { cookie: cookie2, body: { avatarUrl: pngAvatar } });
  check("PATCH 可更新头像且无需邮箱验证码", r.status === 200 && r.json?.avatarUrl === pngAvatar, `${r.status} ${r.text?.slice(0,120)}`);
  let avatarRows = await q("SELECT username,avatar_url AS avatarUrl FROM app_users WHERE username='pengtest'");
  check("头像持久化到登录账号", avatarRows[0]?.avatarUrl === pngAvatar, JSON.stringify(avatarRows));

  r = await call(auth, "GET", "/api/auth", { cookie: cookie2 });
  check("当前会话可读回头像", r.status === 200 && r.json?.user?.avatarUrl === pngAvatar, r.text?.slice(0,160));
  r = await call(auth, "POST", "/api/auth", { body: { action: "login", username: "pengtest", password: "Secret#12345" } });
  check("重新登录响应返回持久化头像", r.status === 200 && r.json?.user?.avatarUrl === pngAvatar, r.text?.slice(0,160));

  r = await call(auth, "PATCH", "/api/auth", { cookie: cookie2, body: { avatarUrl: "https://example.com/avatar.png" } });
  check("拒绝任意头像 URL", r.status === 400, `${r.status} ${r.text?.slice(0,120)}`);
  r = await call(auth, "PATCH", "/api/auth", { cookie: cookie2, body: { avatarUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" } });
  check("拒绝 SVG 头像", r.status === 400, `${r.status} ${r.text?.slice(0,120)}`);
  r = await call(auth, "PATCH", "/api/auth", { cookie: cookie2, body: { avatarUrl: imageData("image/png", [0xff, 0xd8, 0xff, 0xd9]) } });
  check("拒绝 MIME 与图片内容不符", r.status === 400, `${r.status} ${r.text?.slice(0,120)}`);
  r = await call(auth, "PATCH", "/api/auth", { cookie: cookie2, body: { avatarUrl: `data:image/png;base64,${"A".repeat(700000)}` } });
  check("拒绝超过 512 KB 的头像", r.status === 400, `${r.status} ${r.text?.slice(0,120)}`);
  avatarRows = await q("SELECT avatar_url AS avatarUrl FROM app_users WHERE username='pengtest'");
  check("非法更新不破坏原头像", avatarRows[0]?.avatarUrl === pngAvatar, JSON.stringify(avatarRows));

  r = await call(auth, "PATCH", "/api/auth", { cookie: cookie2, body: { avatarUrl: null } });
  check("PATCH null 可清除头像", r.status === 200 && r.json?.avatarUrl === null, `${r.status} ${r.text?.slice(0,120)}`);
  r = await call(auth, "GET", "/api/auth", { cookie: cookie2 });
  check("清除头像持久化到当前会话", r.status === 200 && r.json?.user?.avatarUrl === null, r.text?.slice(0,160));

  r = await call(auth, "POST", "/api/auth", { body: { action: "register", username: "avatarother", password: "Secret#54321", displayName: "另一个账号" } });
  const otherCookie = (r.headers?.get?.("set-cookie") || "").split(";")[0];
  check("注册响应包含空头像", r.status === 200 && r.json?.user?.avatarUrl === null && otherCookie.includes("="), r.text?.slice(0,160));
  r = await call(auth, "PATCH", "/api/auth", { cookie: otherCookie, body: { avatarUrl: jpegAvatar } });
  avatarRows = await q("SELECT username,avatar_url AS avatarUrl FROM app_users WHERE username IN ('pengtest','avatarother') ORDER BY username");
  check("头像更新严格关联当前会话账号", r.status === 200 && avatarRows.find((row) => row.username === "avatarother")?.avatarUrl === jpegAvatar && avatarRows.find((row) => row.username === "pengtest")?.avatarUrl === null, JSON.stringify(avatarRows));

  const oauthMod = await import("../../app/oauth.ts");
  const oauthAuth = await import("../../app/auth.ts");
  const oauthProfile = {
    provider: "wechat",
    subject: "openid:avatar-test",
    displayName: "微信头像用户",
    avatarUrl: jpegAvatar,
  };
  const oauthUser = await oauthMod.provisionOauthUser(oauthProfile);
  let oauthRows = await q("SELECT u.avatar_url AS avatarUrl,i.avatar_url AS identityAvatarUrl FROM app_users u JOIN app_identities i ON i.user_id=u.id WHERE u.id=?", oauthUser.id);
  check("OAuth 首次建号导入平台头像", oauthUser.avatarUrl === jpegAvatar && oauthRows[0]?.avatarUrl === jpegAvatar && oauthRows[0]?.identityAvatarUrl === jpegAvatar, JSON.stringify(oauthRows));

  await oauthMod.provisionOauthUser({ ...oauthProfile, avatarUrl: jpegAvatar2 });
  oauthRows = await q("SELECT u.avatar_url AS avatarUrl,i.avatar_url AS identityAvatarUrl FROM app_users u JOIN app_identities i ON i.user_id=u.id WHERE u.id=?", oauthUser.id);
  check("未自定义时 OAuth 登录同步平台头像", oauthRows[0]?.avatarUrl === jpegAvatar2 && oauthRows[0]?.identityAvatarUrl === jpegAvatar2, JSON.stringify(oauthRows));

  const oauthSession = await oauthAuth.createSession(oauthUser.id, new Request("http://localhost:3000/api/auth"));
  const oauthCookie = oauthSession.cookie.split(";")[0];
  r = await call(auth, "PATCH", "/api/auth", { cookie: oauthCookie, body: { avatarUrl: webpAvatar } });
  await oauthMod.provisionOauthUser({ ...oauthProfile, avatarUrl: jpegAvatar });
  oauthRows = await q("SELECT u.avatar_url AS avatarUrl,i.avatar_url AS identityAvatarUrl FROM app_users u JOIN app_identities i ON i.user_id=u.id WHERE u.id=?", oauthUser.id);
  check("OAuth 登录不覆盖用户自定义头像", r.status === 200 && oauthRows[0]?.avatarUrl === webpAvatar && oauthRows[0]?.identityAvatarUrl === jpegAvatar, JSON.stringify(oauthRows));

  r = await call(auth, "PATCH", "/api/auth", { cookie: oauthCookie, body: { avatarUrl: null } });
  await oauthMod.provisionOauthUser({ ...oauthProfile, avatarUrl: jpegAvatar2 });
  oauthRows = await q("SELECT u.avatar_url AS avatarUrl,i.avatar_url AS identityAvatarUrl FROM app_users u JOIN app_identities i ON i.user_id=u.id WHERE u.id=?", oauthUser.id);
  check("OAuth 登录保留用户主动清除头像", r.status === 200 && oauthRows[0]?.avatarUrl === null && oauthRows[0]?.identityAvatarUrl === jpegAvatar2, JSON.stringify(oauthRows));

  r = await call(auth, "DELETE", "/api/auth?action=delete-account", {
    cookie: oauthCookie,
    headers: { "x-forwarded-for": "127.0.0.3" },
    body: { confirmation: "删除账号" },
  });
  check("无本地密码的 OAuth 账号也可注销", r.status === 200, `${r.status} ${r.text?.slice(0,120)}`);
  const oauthDeleted = await q("SELECT disabled FROM app_users WHERE id=?", oauthUser.id);
  check("OAuth 注销后账号被停用", oauthDeleted[0]?.disabled === 1, JSON.stringify(oauthDeleted));
}

describe("WebDAV 同步安全");
r = await call(webdav, "POST", "/api/webdav-sync", { body: { action: "download", url: "https://dav.example.com/backup", username: "u", password: "p" } });
check("未登录WebDAV被拒(本次修复)", r.status === 401, `${r.status} ${r.text?.slice(0,100)}`);
r = await call(webdav, "POST", "/api/webdav-sync", { cookie: cookie2, body: { action: "download", url: "http://dav.example.com/backup", username: "u", password: "p" } });
check("HTTP明文地址被拒", r.status === 400 && (r.json?.error||"").includes("HTTPS"), `${r.status} ${r.text?.slice(0,120)}`);
r = await call(webdav, "POST", "/api/webdav-sync", { cookie: cookie2, body: { action: "upload", url: "https://dav.example.com/x", username: "u", password: "p", payload: "" } });
check("空备份上传被拒", r.status === 400 && (r.json?.error||"").includes("为空"), `${r.status} ${r.text?.slice(0,120)}`);
r = await call(webdav, "POST", "/api/webdav-sync", { cookie: cookie2, body: { action: "download", url: "https://dav.example.com/backup", username: "u".repeat(257), password: "p" } });
check("WebDAV 凭据字段超过上限被拒", r.status === 400 && (r.json?.error || "").includes("用户名"), `${r.status} ${r.text?.slice(0,120)}`);
r = await call(webdav, "POST", "/api/webdav-sync", { cookie: cookie2, body: { action: "download", url: "https://dav.example.com/backup", username: "u\n", password: "p" } });
check("WebDAV 凭据控制字符被拒", r.status === 400 && (r.json?.error || "").includes("用户名"), `${r.status} ${r.text?.slice(0,120)}`);
{
  const originalFetch = globalThis.fetch;
  const requestWebdav = async (url) => {
    const request = new Request("https://ledger.example.com/api/webdav-sync", { method: "POST", headers: { cookie: cookie2, "content-type": "application/json" }, body: JSON.stringify({ action: "download", url, username: "u", password: "p" }) });
    const response = await webdav.POST(request);
    return { status: response.status, text: await response.text() };
  };
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response("", { status: 200 }); };
  const mapped = await requestWebdav("https://[::ffff:10.0.0.1]/backup");
  check("IPv4-mapped IPv6 私网目标被拒", mapped.status === 400 && calls === 0, `${mapped.status} ${mapped.text}`);
  globalThis.fetch = async () => new Response("", { status: 302, headers: { location: "https://evil.example.net/file" } });
  const crossOrigin = await requestWebdav("https://dav.example.com/backup");
  check("WebDAV 跨域重定向被拒", crossOrigin.status === 400 && crossOrigin.text.includes("跨域"), `${crossOrigin.status} ${crossOrigin.text}`);
  let hop = 0;
  globalThis.fetch = async () => hop++ === 0 ? new Response("", { status: 302, headers: { location: "/next" } }) : new Response("encrypted", { status: 200 });
  const sameOrigin = await requestWebdav("https://dav.example.com/backup");
  check("WebDAV 同域重定向逐跳校验后允许", sameOrigin.status === 200 && hop === 2, `${sameOrigin.status} ${sameOrigin.text}`);
  globalThis.fetch = originalFetch;
}
{
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), method: init.method || "GET", authorization: new Headers(init.headers).get("authorization") });
    return init.method === "PUT"
      ? new Response("", { status: 201 })
      : new Response("encrypted-cloud-payload", { status: 200 });
  };
  r = await call(webdav, "POST", "/api/webdav-sync", { cookie: cookie2, body: { action: "upload", url: "https://dav.example.com/ledger", username: "peng", password: "app-pass", payload: "encrypted-cloud-payload" } });
  check("WebDAV 加密备份真实上传", r.status === 200 && requests[0]?.method === "PUT" && requests[0]?.url.endsWith("/ledger/neo-ledger.e2ee.json"), `${r.status} ${JSON.stringify(requests)}`);
  r = await call(webdav, "POST", "/api/webdav-sync", { cookie: cookie2, body: { action: "download", url: "https://dav.example.com/ledger", username: "peng", password: "app-pass" } });
  check("WebDAV 加密备份真实下载", r.status === 200 && r.json?.payload === "encrypted-cloud-payload", `${r.status} ${r.text?.slice(0,120)}`);
  check("WebDAV 使用应用密码认证", requests.every((item) => item.authorization?.startsWith("Basic ")), JSON.stringify(requests));
  globalThis.fetch = originalFetch;
}
{
  const originalFetch = globalThis.fetch;
  const methods = [];
  let uploadAttempts = 0;
  globalThis.fetch = async (_url, init = {}) => {
    const method = init.method || "GET";
    methods.push(method);
    if (method === "MKCOL") return new Response("", { status: 201 });
    if (method === "PUT" && uploadAttempts++ === 0)
      return new Response("", { status: 409 });
    return new Response("", { status: 201 });
  };
  r = await call(webdav, "POST", "/api/webdav-sync", { cookie: cookie2, body: { action: "upload", url: "https://dav.example.com/NeoLedger", username: "peng", password: "app-pass", payload: "encrypted-cloud-payload" } });
  check("WebDAV 首次同步自动创建文件夹", r.status === 200 && methods.join(",") === "PUT,MKCOL,PUT" && r.json?.fileUrl?.endsWith("/NeoLedger/neo-ledger.e2ee.json"), `${r.status} ${JSON.stringify({ methods, body: r.json })}`);
  globalThis.fetch = originalFetch;
}

describe("请求体边界");
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("x", { status: 200, headers: { "content-length": String(51 * 1024 * 1024) } });
  r = await call(webdav, "POST", "/api/webdav-sync", { cookie: cookie2, body: { action: "download", url: "https://dav.example.com/too-large", username: "u", password: "p" } });
  check("WebDAV 超大响应被拒", r.status === 413, `${r.status} ${r.text?.slice(0,120)}`);
  globalThis.fetch = originalFetch;
}
r = await call(restore, "POST", "/api/data/restore", {
  headers: { "content-length": String(51 * 1024 * 1024) },
  raw: "{}",
});
check("恢复请求超过硬上限时拒绝", r.status === 413, String(r.status));
r = await call(billImport, "POST", "/api/bill-import", {
  cookie: cookie2,
  headers: { "content-length": String(16 * 1024 * 1024) },
  body: { ledgerId: 1, items: [] },
});
check("账单导入超过硬上限时拒绝", r.status === 413, String(r.status));

describe("屏幕隐私锁限流");
r = await call(prefs, "PATCH", "/api/preferences", {
  cookie: cookie2,
  body: { enabled: true, pin: "1234" },
});
check("启用屏幕隐私锁", r.status === 200, `${r.status} ${r.text?.slice(0,120)}`);
const pinAttempts = [];
for (let index = 0; index < 6; index += 1) {
  const attempt = await call(prefs, "POST", "/api/preferences", {
    cookie: cookie2,
    body: { pin: "0000" },
  });
  pinAttempts.push(attempt);
}
check("屏幕锁错误 PIN 达到上限后限流", pinAttempts.slice(0, 5).every((attempt) => attempt.status === 401) && pinAttempts[5]?.status === 429, JSON.stringify(pinAttempts.map((attempt) => attempt.status)));
check("屏幕锁限流返回准确重试窗口", pinAttempts[5] && Number(pinAttempts[5].headers?.get?.("retry-after")) > 0 && Number(pinAttempts[5].headers?.get?.("retry-after")) <= 900, pinAttempts[5]?.text?.slice(0,160));

describe("账号设备、审计与账务工作台");
const deviceOwnerId = (await q("SELECT id FROM app_users WHERE username='pengtest'"))[0]?.id;
await B.prepare(
  "INSERT OR REPLACE INTO app_session_devices(id,token_hash,user_id,display_name,user_agent,ip_address,expires_at,revoked_at) VALUES(?,?,?,?,?,?,?,?)",
).bind(
  "expired-device-proof",
  "expired-device-token-hash",
  deviceOwnerId,
  "过期设备",
  null,
  null,
  "2000-01-01T00:00:00.000Z",
  null,
).run();
await B.prepare(
  "INSERT OR REPLACE INTO app_session_devices(id,token_hash,user_id,display_name,user_agent,ip_address,expires_at,revoked_at) VALUES(?,?,?,?,?,?,?,?)",
).bind(
  "revoked-device-proof",
  "revoked-device-token-hash",
  deviceOwnerId,
  "撤销设备",
  null,
  null,
  "2099-01-01T00:00:00.000Z",
  "2026-08-18T00:00:00.000Z",
).run();
await B.batch([
  B.prepare("INSERT OR REPLACE INTO app_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind("expired-device-token-hash", deviceOwnerId, "2099-01-01T00:00:00.000Z"),
  B.prepare("INSERT OR REPLACE INTO app_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind("revoked-device-token-hash", deviceOwnerId, "2099-01-01T00:00:00.000Z"),
]);
r = await call(sessionsApi, "GET", "/api/security/sessions", { cookie: cookie2 });
check("设备会话列表只返回当前账号", r.status === 200 && r.json?.sessions?.some?.((item) => item.current), `${r.status} ${r.text?.slice(0,160)}`);
check("设备会话列表具备缓存隔离与容量标记", r.status === 200 && r.headers?.get("cache-control")?.includes("no-store") && r.headers?.get("x-content-type-options") === "nosniff" && Number(r.headers?.get("x-total-count")) >= r.json.sessions.length && ["0", "1"].includes(r.headers?.get("x-has-more") || ""), `${r.status} ${r.text?.slice(0,160)}`);
check(
  "设备列表清理并隐藏过期或已撤销记录",
  r.status === 200 &&
    !r.json?.sessions?.some?.((item) => item.id === "expired-device-proof" || item.id === "revoked-device-proof") &&
    (await q("SELECT COUNT(*) n FROM app_session_devices WHERE id IN ('expired-device-proof','revoked-device-proof')"))[0]?.n === 0 &&
    (await q("SELECT COUNT(*) n FROM app_sessions WHERE token_hash IN ('expired-device-token-hash','revoked-device-token-hash')"))[0]?.n === 0,
  `${r.status} ${r.text?.slice(0,180)}`,
);
const inconsistentSession = await authLib.createSession(deviceOwnerId, new Request("https://ledger.example.com/api/auth"));
const inconsistentHash = await authLib.authTokenDigest(inconsistentSession.token);
await B.prepare("UPDATE app_session_devices SET revoked_at='2026-08-18T00:00:00.000Z' WHERE token_hash=?").bind(inconsistentHash).run();
const revokedSessionAccess = await call(ledgers, "GET", "/api/ledgers", { cookie: inconsistentSession.cookie.split(";")[0] });
check("设备撤销后残留 session token 不能继续访问账本", revokedSessionAccess.status === 401, `${revokedSessionAccess.status} ${revokedSessionAccess.text?.slice(0,140)}`);
await B.batch([
  B.prepare("DELETE FROM app_sessions WHERE token_hash=?").bind(inconsistentHash),
  B.prepare("DELETE FROM app_session_devices WHERE token_hash=?").bind(inconsistentHash),
]);
const absoluteExpirySession = await authLib.createSession(deviceOwnerId, new Request("https://ledger.example.com/api/auth"));
const absoluteExpiryHash = await authLib.authTokenDigest(absoluteExpirySession.token);
await B.prepare("UPDATE app_sessions SET expires_at='2000-01-01T00:00:00.000Z',last_used_at='2099-01-01T00:00:00.000Z' WHERE token_hash=?").bind(absoluteExpiryHash).run();
check(
  "会话绝对过期后拒绝访问",
  await authLib.sessionUserFromRequest(new Request("https://ledger.example.com/api/ledgers", { headers: { cookie: absoluteExpirySession.cookie.split(";")[0] } })) === null,
  absoluteExpiryHash,
);
const idleExpirySession = await authLib.createSession(deviceOwnerId, new Request("https://ledger.example.com/api/auth"));
const idleExpiryHash = await authLib.authTokenDigest(idleExpirySession.token);
await B.prepare("UPDATE app_sessions SET expires_at='2099-01-01T00:00:00.000Z',last_used_at='2000-01-01T00:00:00.000Z' WHERE token_hash=?").bind(idleExpiryHash).run();
check(
  "会话闲置超过14天后拒绝访问",
  await authLib.sessionUserFromRequest(new Request("https://ledger.example.com/api/ledgers", { headers: { cookie: idleExpirySession.cookie.split(";")[0] } })) === null,
  idleExpiryHash,
);
await B.batch([
  B.prepare("DELETE FROM app_sessions WHERE token_hash IN (?,?)").bind(absoluteExpiryHash, idleExpiryHash),
  B.prepare("DELETE FROM app_session_devices WHERE token_hash IN (?,?)").bind(absoluteExpiryHash, idleExpiryHash),
]);
r = await call(auditApi, "GET", "/api/security/audit?limit=20", { cookie: cookie2 });
check("敏感操作审计可读取", r.status === 200 && Array.isArray(r.json?.events) && r.json.events.length > 0, `${r.status} ${r.text?.slice(0,160)}`);
const auditPage = await call(auditApi, "GET", "/api/security/audit?limit=1", { cookie: cookie2, headers: { "x-request-id": "audit-page-20260819" } });
const auditCursor = auditPage.json?.nextCursor;
check("安全审计支持有序游标分页", auditPage.status === 200 && auditPage.json?.events?.length === 1 && auditPage.json?.hasMore === true && auditCursor && auditPage.headers?.get("x-has-more") === "1", auditPage.text?.slice(0,180));
check("安全审计成功响应带请求 ID", auditPage.headers?.get("x-request-id") === "audit-page-20260819", auditPage.text?.slice(0,180));
const nextAuditPage = auditCursor ? await call(auditApi, "GET", `/api/security/audit?limit=1&cursor=${encodeURIComponent(auditCursor)}`, { cookie: cookie2 }) : null;
check("安全审计游标翻页不重复上一条", Boolean(nextAuditPage?.status === 200 && nextAuditPage.json?.events?.[0]?.id && nextAuditPage.json.events[0].id !== auditPage.json.events[0].id), nextAuditPage?.text?.slice(0,180));
r = await call(auditApi, "GET", "/api/security/audit?cursor=invalid-cursor", { cookie: cookie2 });
check("安全审计拒绝伪造游标", r.status === 400, `${r.status} ${r.text?.slice(0,160)}`);

describe("MFA 恢复码闭环");
r = await call(mfaApi, "POST", "/api/auth/mfa", {
  cookie: cookie2,
  body: { action: "begin" },
});
const mfaSecret = r.json?.secret;
check("开始配置 MFA 返回验证器密钥", r.status === 200 && mfaSecret, `${r.status} ${r.text?.slice(0,160)}`);
const initialTotp = await totpCodeAt(mfaSecret);
r = await call(mfaApi, "POST", "/api/auth/mfa", {
  cookie: cookie2,
  body: { action: "enable", code: initialTotp },
});
const initialRecoveryCodes = r.json?.recoveryCodes ?? [];
check("启用 MFA 只返回一次十个恢复码", r.status === 200 && initialRecoveryCodes.length === 10, `${r.status} ${r.text?.slice(0,220)}`);
const storedRecovery = await q("SELECT code_hash codeHash,used_at usedAt FROM user_mfa_recovery_codes");
check(
  "恢复码数据库只保存摘要",
  storedRecovery.length === 10 &&
    storedRecovery.every((item) => /^[a-f0-9]{64}$/.test(item.codeHash) && !initialRecoveryCodes.includes(item.codeHash)),
  JSON.stringify(storedRecovery).slice(0, 200),
);
r = await call(mfaApi, "POST", "/api/auth/mfa", {
  cookie: cookie2,
  body: { action: "begin" },
});
check("已启用 MFA 时不能覆盖验证器密钥", r.status === 409, `${r.status} ${r.text?.slice(0,160)}`);
r = await call(mfaApi, "DELETE", "/api/auth/mfa", {
  cookie: cookie2,
  body: { code: initialTotp },
});
check("启用时使用过的 TOTP 不能重放来关闭 MFA", r.status === 409, `${r.status} ${r.text?.slice(0,160)}`);
r = await call(auth, "POST", "/api/auth", {
  body: { action: "login", username: "pengtest", password: "Secret#12345", mfaCode: initialRecoveryCodes[0] },
});
const recoverySession = (r.headers?.get?.("set-cookie") || "").split(";")[0];
check("恢复码可以登录且返回剩余数量", r.status === 200 && recoverySession && r.json?.mfaRecoveryUsed === true && r.json?.recoveryCodesRemaining === 9, `${r.status} ${r.text?.slice(0,180)}`);
r = await call(auth, "POST", "/api/auth", {
  body: { action: "login", username: "pengtest", password: "Secret#12345", mfaCode: initialRecoveryCodes[0] },
});
check("同一恢复码不能重复登录", r.status === 401, `${r.status} ${r.text?.slice(0,140)}`);
r = await call(mfaApi, "GET", "/api/auth/mfa", { cookie: recoverySession });
check("MFA 状态返回恢复码余量", r.status === 200 && r.json?.recoveryCodesRemaining === 9, `${r.status} ${r.text?.slice(0,140)}`);
const refreshTotp = await totpCodeAt(mfaSecret, Date.now() + 30_000);
r = await call(mfaApi, "POST", "/api/auth/mfa", {
  cookie: recoverySession,
  body: { action: "regenerate-recovery", code: refreshTotp },
});
const replacementRecoveryCodes = r.json?.recoveryCodes ?? [];
check("通过新 TOTP 可重新生成恢复码", r.status === 200 && replacementRecoveryCodes.length === 10, `${r.status} ${r.text?.slice(0,180)}`);
r = await call(auth, "POST", "/api/auth", {
  body: { action: "login", username: "pengtest", password: "Secret#12345", mfaCode: initialRecoveryCodes[1] },
});
check("重新生成后旧恢复码全部失效", r.status === 401, `${r.status} ${r.text?.slice(0,140)}`);
r = await call(auth, "POST", "/api/auth", {
  body: { action: "login", username: "pengtest", password: "Secret#12345", mfaCode: replacementRecoveryCodes[0] },
});
check("新恢复码可登录", r.status === 200 && r.json?.mfaRecoveryUsed === true, `${r.status} ${r.text?.slice(0,160)}`);
const concurrentRecovery = await Promise.all([
  call(auth, "POST", "/api/auth", {
    body: { action: "login", username: "pengtest", password: "Secret#12345", mfaCode: replacementRecoveryCodes[1] },
  }),
  call(auth, "POST", "/api/auth", {
    body: { action: "login", username: "pengtest", password: "Secret#12345", mfaCode: replacementRecoveryCodes[1] },
  }),
]);
check(
  "并发使用同一恢复码只能成功一次",
  concurrentRecovery.map((item) => item.status).sort().join(",") === "200,401",
  JSON.stringify(concurrentRecovery.map((item) => item.status)),
);
const recoveryAudit = await q("SELECT event_type eventType FROM audit_events WHERE event_type IN ('mfa.recovery_use','mfa.recovery_regenerate')");
check("恢复码使用和重置写入安全审计", new Set(recoveryAudit.map((item) => item.eventType)).size === 2, JSON.stringify(recoveryAudit));
const auditRow = (await q("SELECT id FROM audit_events ORDER BY created_at DESC LIMIT 1"))[0];
let auditAppendOnly = Boolean(auditRow);
if (auditRow) {
  try {
    await B.prepare("DELETE FROM audit_events WHERE id=?").bind(auditRow.id).run();
    auditAppendOnly = false;
  } catch {
    // Expected: audit records cannot be deleted, even by a direct database writer.
  }
}
check("安全审计事件由数据库强制只追加", auditAppendOnly, JSON.stringify(auditRow));
const workLedger = (await q("SELECT id FROM ledgers WHERE owner_id=? ORDER BY id LIMIT 1", "user:" + (await q("SELECT id FROM app_users WHERE username='pengtest'")).at(0)?.id))[0]?.id;
const workTransactions = await q("SELECT id FROM transactions WHERE ledger_id=? ORDER BY id LIMIT 2", workLedger);
if (workLedger && workTransactions.length) {
  r = await call(reconciliationApi, "POST", "/api/transactions/reconciliation", { cookie: cookie2, headers: { origin: "https://evil.example" }, body: { ledgerId: workLedger, transactionIds: [workTransactions[0].id], status: "reconciled" } });
  check("账本写接口统一拒绝跨源请求", r.status === 403, `${r.status} ${r.text?.slice(0,160)}`);
  r = await call(reconciliationApi, "POST", "/api/transactions/reconciliation", { cookie: cookie2, body: { ledgerId: workLedger, transactionIds: workTransactions.map((item) => item.id), status: "reconciled", note: "测试核对" } });
  check("批量标记流水已核对", r.status === 200 && r.json?.updated === workTransactions.length, `${r.status} ${r.text?.slice(0,160)}`);
  r = await call(reconciliationApi, "GET", `/api/transactions/reconciliation?ledger=${workLedger}`, { cookie: cookie2 });
  check("对账状态可回读", r.status === 200 && r.json?.filter?.((item) => workTransactions.some((tx) => tx.id === item.transactionId)).every?.((item) => item.status === "reconciled") && r.headers?.get?.("cache-control")?.includes("no-store"), `${r.status} ${r.text?.slice(0,160)}`);
  r = await call(reconciliationApi, "GET", `/api/transactions/reconciliation?ledger=${workLedger}&ids=${workTransactions[0].id}`, { cookie: cookie2 });
  check("对账状态支持按当前账单页有界读取", r.status === 200 && r.json?.length === 1 && r.json[0]?.transactionId === workTransactions[0].id, `${r.status} ${r.text?.slice(0,160)}`);
  r = await call(reconciliationApi, "GET", `/api/transactions/reconciliation?ledger=${workLedger}&ids=bad`, { cookie: cookie2 });
  check("对账状态拒绝非法流水ID范围", r.status === 400, `${r.status} ${r.text?.slice(0,160)}`);
  r = await call(bulkTransactionsApi, "POST", "/api/transactions/bulk", { cookie: cookie2, body: { ledgerId: workLedger, transactionIds: [workTransactions[0].id], mood: "刚需" } });
  check("批量修改流水字段", r.status === 200 && r.json?.updated === 1, `${r.status} ${r.text?.slice(0,160)}`);
  r = await call(bulkTransactionsApi, "POST", "/api/transactions/bulk", { cookie: cookie2, body: { ledgerId: workLedger, transactionIds: [workTransactions[0].id, "bad"], mood: "刚需" } });
  check("批量修改不再静默过滤非法ID", r.status === 400 && r.json?.code === "request_failed", `${r.status} ${r.text?.slice(0,160)}`);
  r = await call(bulkTransactionsApi, "POST", "/api/transactions/bulk", { cookie: cookie2, body: { ledgerId: workLedger, transactionIds: [workTransactions[0].id], mood: "无效情绪" } });
  check("批量修改枚举由schema拒绝", r.status === 400, `${r.status} ${r.text?.slice(0,160)}`);
  r = await call(reconciliationApi, "POST", "/api/transactions/reconciliation", { cookie: cookie2, body: { ledgerId: workLedger, transactionIds: [workTransactions[0].id], status: "reconciled", note: "x".repeat(301) } });
  check("对账备注超限不再静默截断", r.status === 400, `${r.status} ${r.text?.slice(0,160)}`);
  r = await call(rulesApi, "POST", "/api/automation/rules", { cookie: cookie2, body: { ledgerId: workLedger, name: "测试餐饮规则", enabled: true, conditions: { merchantContains: "测试咖啡", minAmount: 1 }, actions: { category: "餐饮", mood: "悦己" } } });
  check("创建可解释自动化规则", r.status === 201 && r.json?.id, `${r.status} ${r.text?.slice(0,160)}`);
  const ruleId = r.json?.id;
  r = await call(rulesApi, "POST", "/api/automation/rules", { cookie: cookie2, body: { ledgerId: workLedger, name: "嵌套注入", conditions: { merchantContains: "咖啡", sql: "DROP" }, actions: { category: "餐饮" } } });
  check("自动化嵌套未知条件被拒", r.status === 400, `${r.status} ${r.text?.slice(0,160)}`);
  r = await call(rulesApi, "POST", "/api/automation/rules", { cookie: cookie2, body: { ledgerId: workLedger, name: "越界优先级", priority: 10001, conditions: { merchantContains: "咖啡" }, actions: { category: "餐饮" } } });
  check("自动化优先级不再静默夹紧", r.status === 400, `${r.status} ${r.text?.slice(0,160)}`);
  r = await call(rulesApi, "GET", `/api/automation/rules?ledger=${workLedger}`, { cookie: cookie2 });
  check("自动化规则可回读", r.status === 200 && r.json?.some?.((item) => item.id === ruleId && item.conditions?.merchantContains === "测试咖啡"), `${r.status} ${r.text?.slice(0,160)}`);
  check("自动化规则列表具备容量与缓存边界", r.status === 200 && r.headers?.get("cache-control")?.includes("no-store") && r.headers?.get("x-content-type-options") === "nosniff" && Number(r.headers?.get("x-total-count")) >= r.json.length && ["0", "1"].includes(r.headers?.get("x-has-more") || ""), `${r.status} ${r.text?.slice(0,160)}`);
  r = await call(rulesApi, "PATCH", "/api/automation/rules", { cookie: cookie2, headers: { origin: "https://evil.example" }, body: { ledgerId: workLedger, id: ruleId, enabled: false } });
  check("自动化规则写入拒绝跨源请求", r.status === 403, `${r.status} ${r.text?.slice(0,160)}`);
  const automationAccount = (await q("SELECT id,currency FROM accounts WHERE ledger_id=? ORDER BY id LIMIT 1", workLedger))[0];
  if (automationAccount) {
    const inserted = await B.prepare("INSERT INTO pending_transactions(ledger_id,raw_text,title,amount,type,account_id,currency,occurred_at) VALUES(?,?,?,?,?,?,?,?)").bind(workLedger, "微信支付 测试咖啡", "测试咖啡", 1880, "支出", automationAccount.id, automationAccount.currency, "2026-08-11T12:00:00.000Z").run();
    await B.prepare("UPDATE accounts SET current_balance=current_balance-1880 WHERE id=?").bind(automationAccount.id).run();
    const pendingId = Number(inserted.meta.last_row_id);
    r = await call(pendingApi, "GET", `/api/pending-transactions?ledger=${workLedger}`, { cookie: cookie2 });
    const suggested = r.json?.find?.((item) => item.id === pendingId);
    check("待确认流水返回规则建议与命中解释", suggested?.automationSuggestion?.ruleId === ruleId && suggested.automationSuggestion.reasons.length >= 2 && r.headers?.get?.("x-total-count") && r.headers?.get?.("cache-control")?.includes("no-store"), `${r.status} ${r.text?.slice(0,220)}`);
    r = await call(pendingApi, "GET", `/api/pending-transactions?ledger=${workLedger}&limit=101`, { cookie: cookie2 });
    check("待确认流水拒绝越界页大小", r.status === 400, `${r.status} ${r.text?.slice(0,140)}`);
    r = await call(pendingApi, "PATCH", "/api/pending-transactions", { cookie: cookie2, body: { id: pendingId, action: "confirm" } });
    const automatedTx = (await q("SELECT category_dynamic category,mood FROM transactions WHERE ledger_id=? AND title='测试咖啡' ORDER BY id DESC LIMIT 1", workLedger))[0];
    check("用户确认后应用规则动作", r.status === 200 && r.json?.appliedRule?.ruleId === ruleId && automatedTx?.category === "餐饮" && automatedTx?.mood === "悦己", `${r.status} ${JSON.stringify({ response: r.json, automatedTx })}`);
    const automatedCountBeforeRetry = Number((await q("SELECT COUNT(*) n FROM transactions WHERE ledger_id=? AND title='测试咖啡'", workLedger))[0]?.n ?? 0);
    r = await call(pendingApi, "PATCH", "/api/pending-transactions", { cookie: cookie2, body: { id: pendingId, action: "confirm" } });
    const automatedCountAfterRetry = Number((await q("SELECT COUNT(*) n FROM transactions WHERE ledger_id=? AND title='测试咖啡'", workLedger))[0]?.n ?? 0);
    check("待确认流水重复确认不重复入账", r.status === 409 && automatedCountAfterRetry === automatedCountBeforeRetry, `${r.status} ${r.text?.slice(0,160)} ${automatedCountBeforeRetry}->${automatedCountAfterRetry}`);
  }
  r = await call(rulesApi, "DELETE", "/api/automation/rules", { cookie: cookie2, body: { ledgerId: workLedger, id: ruleId } });
  check("自动化规则可删除", r.status === 200, `${r.status} ${r.text?.slice(0,160)}`);
}

describe("proxy 身份判定（回归：登录后不得被自己的账本挡住）");
{
  // 复现过的线上故障：proxy 在 localhost 上把身份写死成 "local"，
  // 而注册账号后账本归属变成 "user:<id>"，导致所有带 ?ledger= 的接口 403。
  const proxyMod = await import("../../proxy.ts");
  const { SESSION_COOKIE_NAME } = await import("../../app/auth-core.js");
  const authMod = await import("../../app/auth.ts");

  const anyOwned = await q("SELECT id,owner_id AS ownerId FROM ledgers WHERE owner_id LIKE 'user:%' LIMIT 1");
  const targetLedger = anyOwned[0]?.id ?? 1;
  check("存在归属登录用户的账本", !!anyOwned.length, JSON.stringify(await q("SELECT id,owner_id FROM ledgers")));

  const token = cookie2.split("=").slice(1).join("=");
  const proxied = new Request(`http://localhost:3000/api/accounts?ledger=${targetLedger}`, {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
  // NextRequest 的 cookies API 在测试里用最小替身补齐
  proxied.cookies = { get: (name) => (name === SESSION_COOKIE_NAME ? { value: decodeURIComponent(token) } : undefined) };
  proxied.nextUrl = new URL(proxied.url);
  let proxyStatus = 0;
  try {
    const out = await proxyMod.proxy(proxied);
    proxyStatus = out?.status ?? 200;
  } catch (error) {
    proxyStatus = -1;
    check("proxy 未抛异常", false, String(error).slice(0, 160));
  }
  check("带会话访问自己的账本不被 proxy 拦截", proxyStatus !== 403, `status=${proxyStatus}`);

  const suppliedRequestId = "client-request-20260816";
  const traced = new Request(`http://localhost:3000/api/accounts?ledger=${targetLedger}`, {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      "x-request-id": suppliedRequestId,
    },
  });
  traced.cookies = proxied.cookies;
  traced.nextUrl = new URL(traced.url);
  const tracedResponse = await proxyMod.proxy(traced);
  check(
    "proxy 在成功响应透传合法请求 ID",
    tracedResponse.headers.get("x-request-id") === suppliedRequestId,
    tracedResponse.headers.get("x-request-id") ?? "missing",
  );

  const rejected = new Request("https://public.example/api/accounts", {
    headers: { "x-request-id": "bad id" },
  });
  rejected.cookies = { get: () => undefined };
  rejected.nextUrl = new URL(rejected.url);
  const rejectedResponse = await proxyMod.proxy(rejected);
  const rejectedBody = await rejectedResponse.json();
  const generatedRequestId = rejectedResponse.headers.get("x-request-id");
  check(
    "proxy 为非法请求 ID 重新生成安全 ID",
    rejectedResponse.status === 401 &&
      typeof generatedRequestId === "string" &&
      generatedRequestId !== "bad id" &&
      /^[A-Za-z0-9._:-]{8,128}$/.test(generatedRequestId),
    `${rejectedResponse.status} ${generatedRequestId}`,
  );
  check(
    "proxy 错误正文与响应头使用同一请求 ID",
    rejectedBody.requestId === generatedRequestId && rejectedBody.code === "unauthorized",
    JSON.stringify(rejectedBody),
  );

  const publicContract = new Request("https://public.example/api/openapi.json");
  publicContract.cookies = { get: () => undefined };
  publicContract.nextUrl = new URL(publicContract.url);
  const publicContractResponse = await proxyMod.proxy(publicContract);
  check(
    "OpenAPI 契约路径不要求账号会话",
    publicContractResponse.status !== 401,
    `status=${publicContractResponse.status}`,
  );
  const publicPasskey = new Request("https://public.example/api/auth/passkeys", {
    method: "POST",
    headers: {
      origin: "https://public.example",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "begin-authentication" }),
  });
  publicPasskey.cookies = { get: () => undefined };
  publicPasskey.nextUrl = new URL(publicPasskey.url);
  const publicPasskeyResponse = await proxyMod.proxy(publicPasskey);
  check(
    "远程 Passkey 登录挑战不被会话前置门禁拦截",
    publicPasskeyResponse.status !== 401,
    `status=${publicPasskeyResponse.status}`,
  );
  const externalWrite = new Request("https://public.example/api/v1/transactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": "32",
      "x-forwarded-for": "198.51.100.24",
    },
    body: JSON.stringify({ ledgerId: 1, amount: 1 }),
  });
  externalWrite.cookies = { get: () => undefined };
  externalWrite.nextUrl = new URL(externalWrite.url);
  const externalWriteResponse = await proxyMod.proxy(externalWrite);
  check(
    "外部 v1 写入按来源执行 60 次边缘限流且不要求账号会话",
    externalWriteResponse.status !== 401 &&
      externalWriteResponse.headers.get("x-ratelimit-limit") === "60",
    `${externalWriteResponse.status} ${externalWriteResponse.headers.get("x-ratelimit-limit")}`,
  );
  {
    const { env: proxyEnv } = await import("cloudflare:workers");
    const proxySecret = "proxy-edge-test-secret-at-least-32-bytes";
    const proxyAudience = "neo-ledger-test";
    Object.assign(proxyEnv, {
      NEO_TRUSTED_AUTH_HEADERS: "true",
      NEO_TRUSTED_AUTH_SECRET: proxySecret,
      NEO_TRUSTED_AUTH_AUDIENCE: proxyAudience,
      NEO_TRUSTED_PROXY_IPS: "203.0.113.30",
    });
    const forged = new Request("https://public.example/api/accounts", {
      headers: {
        "oai-authenticated-user-email": "gateway-user@example.com",
        "x-real-ip": "203.0.113.30",
        "x-neo-auth-signature": "present-but-forged",
        "x-neo-auth-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-neo-auth-nonce": "proxy-edge-forged-0001",
        "x-neo-auth-audience": proxyAudience,
      },
    });
    forged.cookies = { get: () => undefined };
    forged.nextUrl = new URL(forged.url);
    const forgedResponse = await proxyMod.proxy(forged);
    check("proxy 不因可信身份头存在就接受伪造签名", forgedResponse.status === 401, `${forgedResponse.status}`);
    const validNonce = "proxy-edge-valid-0001";
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(proxySecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const validTimestamp = String(Math.floor(Date.now() / 1000));
    const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`gateway-user@example.com\n${proxyAudience}\n${validTimestamp}\n${validNonce}`));
    const validSignature = Buffer.from(signatureBytes).toString("base64url");
    const validProxyRequest = new Request("https://public.example/api/accounts", {
      headers: {
        "oai-authenticated-user-email": "gateway-user@example.com",
        "x-real-ip": "203.0.113.30",
        "x-neo-auth-signature": validSignature,
        "x-neo-auth-timestamp": validTimestamp,
        "x-neo-auth-nonce": validNonce,
        "x-neo-auth-audience": proxyAudience,
      },
    });
    validProxyRequest.cookies = { get: () => undefined };
    validProxyRequest.nextUrl = new URL(validProxyRequest.url);
    const validProxyResponse = await proxyMod.proxy(validProxyRequest);
    check("proxy 接受正确签名但不提前消费 nonce", validProxyResponse.status !== 401, `${validProxyResponse.status}`);
    Object.assign(proxyEnv, { NEO_TRUSTED_AUTH_HEADERS: "false", NEO_TRUSTED_AUTH_SECRET: "", NEO_TRUSTED_AUTH_AUDIENCE: "neo-ledger", NEO_TRUSTED_PROXY_IPS: "" });
  }

  const { ApiAccessError, accessErrorResponse } = await import("../../app/api-security.ts");
  const routeError = accessErrorResponse(
    new ApiAccessError("测试拒绝", 403),
    "失败",
    new Request("http://localhost/api/test", {
      headers: { "x-request-id": suppliedRequestId },
    }),
  );
  const routeErrorBody = await routeError.json();
  check(
    "路由错误响应复用代理注入的请求 ID",
    routeError.headers.get("x-request-id") === suppliedRequestId &&
      routeErrorBody.requestId === suppliedRequestId &&
      routeErrorBody.code === "forbidden",
    JSON.stringify(routeErrorBody),
  );
  void authMod;
}

describe("账号注销");
{
  let deleteResult = await call(auth, "POST", "/api/auth", {
    body: {
      action: "register",
      username: "delete-me",
      password: "Delete#12345",
      displayName: "待注销账号",
    },
  });
  const deleteCookie = (deleteResult.headers?.get?.("set-cookie") || "").split(";")[0];
  check("创建待注销账号", deleteResult.status === 200 && deleteCookie.includes("="), `${deleteResult.status}`);
  const deleteUserId = (await q("SELECT id FROM app_users WHERE username='delete-me'"))[0]?.id;
  const deleteOwnerId = deleteUserId ? `user:${deleteUserId}` : "";
  const deleteLedgerBefore = deleteUserId
    ? (await q("SELECT COUNT(*) n FROM ledgers WHERE owner_id=?", deleteOwnerId))[0]?.n
    : 0;
  check("注销测试账号已建立独立账本", Number(deleteLedgerBefore) > 0, String(deleteLedgerBefore));
  const deleteSnapshotId = "delete-account-snapshot-test";
  await B.batch([
    B.prepare("INSERT INTO restore_snapshots(id,owner_id,checksum,total_bytes,chunk_count) VALUES(?,?,?,?,?)").bind(deleteSnapshotId, deleteOwnerId, "delete-test", 11, 1),
    B.prepare("INSERT INTO restore_snapshot_chunks(snapshot_id,chunk_index,payload) VALUES(?,?,?)").bind(deleteSnapshotId, 0, "secret-data"),
    B.prepare("INSERT INTO restore_locks(owner_id,lock_id,expires_at) VALUES(?,?,?)").bind(deleteOwnerId, "delete-lock-test", Date.now() + 600_000),
  ]);

  deleteResult = await call(auth, "DELETE", "/api/auth?action=delete-account", {
    cookie: deleteCookie,
    headers: { "x-forwarded-for": "127.0.0.2" },
    body: { currentPassword: "Delete#12345", confirmation: "删掉" },
  });
  check("确认文字错误时拒绝注销", deleteResult.status === 400, `${deleteResult.status} ${deleteResult.text?.slice(0,100)}`);

  deleteResult = await call(auth, "DELETE", "/api/auth?action=delete-account", {
    cookie: deleteCookie,
    headers: { "x-forwarded-for": "127.0.0.2" },
    body: { currentPassword: "Wrong#12345", confirmation: "删除账号" },
  });
  check("当前密码错误时拒绝注销", deleteResult.status === 401, `${deleteResult.status} ${deleteResult.text?.slice(0,100)}`);

  deleteResult = await call(auth, "DELETE", "/api/auth?action=delete-account", {
    cookie: deleteCookie,
    headers: { "x-forwarded-for": "127.0.0.2" },
    body: { currentPassword: "Delete#12345", confirmation: "删除账号" },
  });
  check("正确确认后注销账号", deleteResult.status === 200, `${deleteResult.status} ${deleteResult.text?.slice(0,100)}`);
  const deletedRows = await q("SELECT username,email,disabled FROM app_users WHERE display_name='已注销账号'");
  check("注销后账号匿名化并释放邮箱", deletedRows.some((row) => row.disabled === 1 && row.email === null && row.username.startsWith("deleted_")), JSON.stringify(deletedRows));
  const deletedLedgerRows = deleteOwnerId
    ? await q("SELECT COUNT(*) n FROM ledgers WHERE owner_id=?", deleteOwnerId)
    : [{ n: 1 }];
  const deletedAccountRows = deleteOwnerId
    ? await q("SELECT COUNT(*) n FROM accounts WHERE ledger_id IN (SELECT id FROM ledgers WHERE owner_id=?)", deleteOwnerId)
    : [{ n: 1 }];
  const deletedSnapshotRows = deleteOwnerId
    ? await q("SELECT COUNT(*) n FROM restore_snapshots WHERE owner_id=?", deleteOwnerId)
    : [{ n: 1 }];
  const deletedSnapshotChunkRows = await q("SELECT COUNT(*) n FROM restore_snapshot_chunks WHERE snapshot_id=?", deleteSnapshotId);
  const deletedRestoreLockRows = deleteOwnerId
    ? await q("SELECT COUNT(*) n FROM restore_locks WHERE owner_id=?", deleteOwnerId)
    : [{ n: 1 }];
  check("注销后财务账本与账户不残留", Number(deletedLedgerRows[0]?.n) === 0 && Number(deletedAccountRows[0]?.n) === 0, JSON.stringify({ deletedLedgerRows, deletedAccountRows }));
  check("注销后恢复快照不残留", Number(deletedSnapshotRows[0]?.n) === 0, JSON.stringify(deletedSnapshotRows));
  check("注销后快照正文块与恢复锁不残留", Number(deletedSnapshotChunkRows[0]?.n) === 0 && Number(deletedRestoreLockRows[0]?.n) === 0, JSON.stringify({ deletedSnapshotChunkRows, deletedRestoreLockRows }));

  deleteResult = await call(auth, "POST", "/api/auth", {
    body: { action: "login", username: "delete-me", password: "Delete#12345" },
  });
  check("注销后的原账号不能登录", deleteResult.status === 401, `${deleteResult.status}`);

}

describe("邮箱验证码");
{
  const codeApi = await import("../../app/api/auth/email-code/route.ts");
  const resetApi = await import("../../app/api/auth/reset-password/route.ts");
  const { maskEmail } = await import("../../app/email-code-core.js");

  // 未配置时必须明确报错，不能把终端输出伪装成发信成功。
  let r = await call(codeApi, "GET", "/api/auth/email-code");
  check("GET 返回邮件服务状态", r.status === 200 && r.json?.configured === false, r.text);

  r = await call(codeApi, "POST", "/api/auth/email-code", { body: { email: "reset-target@example.com", purpose: "reset" } });
  check("未配置发信时明确拒绝", r.status === 503, `${r.status} ${r.text?.slice(0,120)}`);

  r = await call(codeApi, "POST", "/api/auth/email-code", { body: { email: "x@example.com", purpose: "删库跑路" } });
  check("非法用途被拒", r.status === 400, `${r.status} ${r.text?.slice(0,100)}`);

  r = await call(codeApi, "POST", "/api/auth/email-code", { body: { email: "不是邮箱", purpose: "register" } });
  check("非法邮箱被拒", r.status >= 400, `${r.status}`);

  process.env.RESEND_API_KEY = "re_test_key";
  process.env.MAIL_FROM = "Neo Ledger <onboarding@resend.dev>";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "mail-test" }), { status: 200 });

  r = await call(codeApi, "POST", "/api/auth/email-code", { body: { email: "reset-target@example.com", purpose: "reset" } });
  check("未注册邮箱的 reset 也返回成功（防枚举）", r.status === 200, `${r.status} ${r.text?.slice(0,120)}`);

  // 真实链路：给已登录用户绑定新邮箱
  const target = "bind-target@example.com";
  r = await call(codeApi, "POST", "/api/auth/email-code", { cookie: cookie2, body: { email: target, purpose: "bind" } });
  check("bind 通过邮件通道发码成功", r.status === 200 && r.json?.configured === true, `${r.status} ${r.text?.slice(0,140)}`);

  const codeRow = await q("SELECT code_hash AS h, purpose, consumed_at AS c FROM email_codes WHERE email=? ORDER BY id DESC LIMIT 1", target);
  check("验证码以哈希存储而非明文", !!codeRow[0]?.h && codeRow[0].h.length >= 32 && !/^\d{6}$/.test(codeRow[0].h), JSON.stringify(codeRow[0]));

  r = await call(codeApi, "POST", "/api/auth/email-code", { cookie: cookie2, body: { email: target, purpose: "bind" } });
  check("60 秒内重复发码被限流(429)", r.status === 429, `${r.status} ${r.text?.slice(0,100)}`);

  r = await call(auth, "PATCH", "/api/auth", { cookie: cookie2, body: { email: target, code: "000000", currentPassword: "Secret#12345" } });
  check("错误验证码绑定失败", r.status >= 400, `${r.status} ${r.text?.slice(0,120)}`);
  const attempts = await q("SELECT attempts FROM email_codes WHERE email=? ORDER BY id DESC LIMIT 1", target);
  check("错误尝试被计数", Number(attempts[0]?.attempts) >= 1, JSON.stringify(attempts[0]));

  r = await call(codeApi, "POST", "/api/auth/email-code", { body: { email: "nobody@example.com", purpose: "bind" } });
  check("未登录不能给自己发绑定码", r.status === 401, `${r.status}`);

  r = await call(resetApi, "POST", "/api/auth/reset-password", { body: { email: "pengtest-mail@example.com", code: "123456", newPassword: "Whatever#123" } });
  check("无有效验证码时重置被拒", r.status >= 400, `${r.status} ${r.text?.slice(0,120)}`);

  const resetTargetResult = await call(auth, "POST", "/api/auth", {
    headers: { "x-forwarded-for": "198.51.100.89" },
    body: { action: "register", username: "reset-target-user", password: "Reset#12345", displayName: "重置测试账号" },
  });
  check("创建密码重置测试账号", resetTargetResult.status === 200 && resetTargetResult.headers?.get?.("set-cookie"), String(resetTargetResult.status));
  const resetTargetId = (await q("SELECT id FROM app_users WHERE username='reset-target-user'"))[0]?.id;
  const resetTargetEmail = "reset-target-user@example.com";
  await B.prepare("UPDATE app_users SET email=?,email_verified=1 WHERE id=?").bind(resetTargetEmail, resetTargetId).run();
  const resetAuth = await import("../../app/auth.ts");
  await resetAuth.createSession(resetTargetId, new Request("http://localhost:3000/api/auth"));
  const resetCode = "246810";
  await B.prepare("INSERT INTO email_codes(email,purpose,code_hash,user_id,expires_at) VALUES(?,?,?,?,?)")
    .bind(resetTargetEmail, "reset", await resetAuth.authTokenDigest(resetTargetEmail + "|reset|" + resetCode), resetTargetId, new Date(Date.now() + 600_000).toISOString())
    .run();
  r = await call(resetApi, "POST", "/api/auth/reset-password", {
    headers: { "x-forwarded-for": "198.51.100.88" },
    body: { email: resetTargetEmail, code: resetCode, newPassword: "Reset#67890" },
  });
  const resetSessionsAfter = await q("SELECT COUNT(*) n FROM app_sessions WHERE user_id=?", resetTargetId);
  const resetDevicesAfter = await q("SELECT COUNT(*) n FROM app_session_devices WHERE user_id=?", resetTargetId);
  const resetAudit = await q("SELECT COUNT(*) n FROM audit_events WHERE owner_id=? AND event_type='auth.password_reset'", "user:" + resetTargetId);
  check("有效验证码可重置密码并撤销旧会话设备", r.status === 200 && Number(resetSessionsAfter[0]?.n) === 0 && Number(resetDevicesAfter[0]?.n) === 0, String(r.status) + " " + JSON.stringify({ resetSessionsAfter, resetDevicesAfter }));
  check("密码重置写入安全审计事件", Number(resetAudit[0]?.n) >= 1, JSON.stringify(resetAudit));
  check("邮箱脱敏可用", maskEmail(target) === "b*********t@example.com", maskEmail(target));
  globalThis.fetch = originalFetch;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
}

if (beforeRestoreSnapshotId) {
  r = await call(restore, "POST", "/api/data/restore", { cookie: cookie2, body: { restoreSnapshotId: beforeRestoreSnapshotId } });
  check("可从自动快照回滚恢复", r.status === 200 && r.json?.ok === true, `${r.status} ${r.text?.slice(0,160)}`);
}
process.exit(summary("套件3 · 恢复/账号/安全") ? 1 : 0);
