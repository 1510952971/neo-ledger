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
  check("数据库迁移到 28", schemaVersion[0]?.value === "28", JSON.stringify(schemaVersion));
  check("app_users 已有头像列", userColumns.some((column) => column.name === "avatar_url"), JSON.stringify(userColumns));
  check("登录响应返回空头像", r.json?.user?.avatarUrl === null, r.text);

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
}

describe("WebDAV 同步安全");
r = await call(webdav, "POST", "/api/webdav-sync", { body: { action: "download", url: "https://dav.example.com/backup", username: "u", password: "p" } });
check("未登录WebDAV被拒(本次修复)", r.status === 401, `${r.status} ${r.text?.slice(0,100)}`);
r = await call(webdav, "POST", "/api/webdav-sync", { cookie: cookie2, body: { action: "download", url: "http://dav.example.com/backup", username: "u", password: "p" } });
check("HTTP明文地址被拒", r.status === 400 && (r.json?.error||"").includes("HTTPS"), `${r.status} ${r.text?.slice(0,120)}`);
r = await call(webdav, "POST", "/api/webdav-sync", { cookie: cookie2, body: { action: "upload", url: "https://dav.example.com/x", username: "u", password: "p", payload: "" } });
check("空备份上传被拒", r.status === 400 && (r.json?.error||"").includes("为空"), `${r.status} ${r.text?.slice(0,120)}`);
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

  check("邮箱脱敏可用", maskEmail(target) === "b*********t@example.com", maskEmail(target));
  globalThis.fetch = originalFetch;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
}

process.exit(summary("套件3 · 恢复/账号/安全") ? 1 : 0);
