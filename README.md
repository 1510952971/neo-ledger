# Neo Ledger

Neo Ledger 是一个本地优先的个人账本，支持多账本、账户与信用卡、储蓄目标、订阅和分期，以及微信、支付宝、美团、京东、银行卡等账单导入。

## 本地运行

需要 Node.js 22.13 或更高版本，以及系统命令 `git`、`sqlite3`。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。`npm run dev` 会同时启动主程序和仅监听本机的更新服务。

## 一键启动（macOS）

在 Finder 中双击 `start.command` 即可：自动检查 Node 版本、按需安装依赖、启动服务，就绪后自动打开浏览器；若程序已在运行则直接打开页面。保持终端窗口开启即在运行，按 `Ctrl+C` 停止。

首次双击如被 macOS 拦截，右键点 `start.command` 选“打开”，再确认一次即可。

## 账号登录

“我的财富仓”支持账号或邮箱登录。注册时邮箱可以留空，登录后可在账号面板绑定或更换；本地密码采用 PBKDF2 加盐存储。

### 邮箱验证与找回密码

只要填了邮箱，注册、绑定/更换邮箱、重置密码三个场景都会走验证码：验证码 6 位、10 分钟有效、一码一用，输错 5 次作废，同一邮箱 60 秒内只能再发一次、每小时最多 5 封。验证码在数据库里只存哈希。重置密码成功后会注销该账号的全部登录会话。

发信走 Resend 的 HTTP API（Cloudflare Workers 运行时没有 TCP，发不了传统 SMTP）。**不配置也能正常使用**——验证码会直接打印在运行程序的终端窗口里，本地自用完全够。要真正收邮件，在 `.env.local` 里补上：

```bash
RESEND_API_KEY=re_xxxxxxxx
MAIL_FROM=Neo Ledger <noreply@你的域名>
```

`RESEND_API_KEY` 在 https://resend.com 注册后创建；`MAIL_FROM` 的域名需要先在 Resend 的 Domains 里添加并按提示配好 DNS 记录才能发信。只是想试一下的话，可以先用 Resend 的测试地址 `onboarding@resend.dev`，但它只能发到你注册 Resend 用的那个邮箱。

微信、支付宝使用开放平台 OAuth 登录。先在对应开放平台创建并审核网站/网页应用，再把 `.env.example` 中的配置复制到本机 `.env.local`：

```bash
AUTH_PUBLIC_ORIGIN=https://你的域名
WECHAT_APP_ID=
WECHAT_APP_SECRET=
ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_PUBLIC_KEY=
```

平台后台需要登记完全一致的回调地址：

- 微信：`https://你的域名/api/auth/oauth/callback?provider=wechat`
- 支付宝：`https://你的域名/api/auth/oauth/callback?provider=alipay`

支付宝应用私钥使用 PKCS#8 格式。程序验证一次性 OAuth 状态和支付宝响应签名，只保存平台用户标识与绑定关系，不保存访问令牌。未配置完整密钥时登录按钮会保持禁用。

## 安全更新

数据中心内置“检查更新”和“一键升级”：

1. 从固定仓库 `1510952971/neo-ledger` 检查最新正式 GitHub Release。
2. 更新前使用 SQLite 在线备份本地 D1 数据库，备份保存在忽略提交的 `backups/`。
3. 只安装与 `package.json` 版本一致的稳定标签，例如 `v1.1.0`。
4. Git 工作区存在未提交修改时拒绝覆盖。
5. 安装后重启程序并执行版本、接口和数据库迁移健康检查。
6. 新版本启动失败时切回原提交并恢复更新前数据库。

`.wrangler/`、`.env*`、`backups/` 和更新状态文件均不会上传 GitHub，因此本地账本和密钥不进入代码仓库。

## 发布版本

先更新 `package.json` 与 `app/app-version.ts` 中的版本，再提交并创建同名标签：

```bash
git tag v1.1.0
git push origin main --tags
```

GitHub Actions 会运行完整构建和测试，通过后自动创建 Release。程序只会把最新的非草稿、非预发布 Release 视为可安装版本。

## 验证

```bash
npm run lint
npm test
```
