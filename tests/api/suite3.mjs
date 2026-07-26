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
const ledgers = await import("../../app/api/ledgers/route.ts");
const accounts = await import("../../app/api/accounts/route.ts");
const webdav = await import("../../app/api/webdav-sync/route.ts");

describe("数据恢复回环");
const snapshot = JSON.parse(fs.readFileSync(process.env.NL_SNAPSHOT, "utf8"));
let r = await call(restore, "POST", "/api/data/restore", { body: snapshot });
check("POST 恢复套件1导出的备份", r.status === 200, `${r.status} ${r.text?.slice(0,200)}`);
const txN = (await q("SELECT COUNT(*) n FROM transactions"))[0].n;
check("流水恢复2条", txN === 2, String(txN));
const acctNames = (await q("SELECT name FROM accounts ORDER BY id")).map(x => x.name);
check("账户恢复(含改名后的工资卡改)", acctNames.includes("工资卡改") && acctNames.includes("信用卡"), JSON.stringify(acctNames));
const bal = (await q("SELECT current_balance b FROM accounts WHERE name='工资卡改'"))[0]?.b;
check("余额恢复精确一致", bal === 1200000 - 3550 + 888888 - 3050 - 30000, String(bal));
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

describe("注册后鉴权边界");
r = await call(ledgers, "GET", "/api/ledgers");
check("无Cookie访问被拒(localhost回退关闭)", r.status === 401, `${r.status} ${r.text?.slice(0,100)}`);
r = await call(ledgers, "GET", "/api/ledgers", { cookie });
check("带Cookie访问正常", r.status === 200 && Array.isArray(r.json), `${r.status}`);
check("旧local数据已过户给首个账号", r.json?.length >= 1, JSON.stringify(r.json)?.slice(0,120));
const L = r.json?.[0]?.id;
r = await call(accounts, "GET", `/api/accounts?ledger=${L}`, { cookie });
check("过户后账户可见", r.status === 200 && r.json?.length >= 2, `${r.status} n=${r.json?.length}`);
r = await call(auth, "DELETE", "/api/auth", { cookie });
check("登出", r.status === 200, `${r.status}`);
r = await call(ledgers, "GET", "/api/ledgers", { cookie });
check("登出后旧Cookie失效", r.status === 401, `${r.status}`);
r = await call(auth, "POST", "/api/auth", { body: { action: "login", username: "pengtest", password: "Secret#12345" } });
const cookie2 = (r.headers?.get?.("set-cookie") || "").split(";")[0];
check("重新登录成功", r.status === 200 && cookie2.includes("="), `${r.status}`);

describe("WebDAV 同步安全");
r = await call(webdav, "POST", "/api/webdav-sync", { body: { action: "download", url: "https://dav.example.com/backup", username: "u", password: "p" } });
check("未登录WebDAV被拒(本次修复)", r.status === 401, `${r.status} ${r.text?.slice(0,100)}`);
r = await call(webdav, "POST", "/api/webdav-sync", { cookie: cookie2, body: { action: "download", url: "http://dav.example.com/backup", username: "u", password: "p" } });
check("HTTP明文地址被拒", r.status === 400 && (r.json?.error||"").includes("HTTPS"), `${r.status} ${r.text?.slice(0,120)}`);
r = await call(webdav, "POST", "/api/webdav-sync", { cookie: cookie2, body: { action: "upload", url: "https://dav.example.com/x", username: "u", password: "p", payload: "" } });
check("空备份上传被拒", r.status === 400 && (r.json?.error||"").includes("为空"), `${r.status} ${r.text?.slice(0,120)}`);

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
  void authMod;
}

process.exit(summary("套件3 · 恢复/账号/安全") ? 1 : 0);
