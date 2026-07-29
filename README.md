# Neo Ledger

Neo Ledger 是一个本地优先的个人账本，支持多账本、账户与信用卡、储蓄目标、订阅和分期，以及微信、支付宝、美团、京东、银行卡等账单导入。

## 使用文档

- [完整使用手册](docs/USER_MANUAL.md)：从首次启动到 Android 自动记账、苹果快捷指令、附近同步、坚果云和 NAS 部署。
- [Android 自动记账伴侣说明](android-companion/README.md)：Android 工程、权限、构建和平台边界。
- [环境变量模板](.env.example)：邮件、OAuth、自动记账、Ollama 和局域网配置。
- [Docker Compose](docker-compose.yml)：NAS 持久化部署入口。

第一次使用建议先阅读完整手册的“第一次使用”和“备份、恢复”章节；准备开启自动记账时，再按对应手机平台章节操作。

## 本地运行

需要 Node.js 22.13 或更高版本，以及系统命令 `git`、`sqlite3`。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。`npm run dev` 会同时启动主程序和仅监听本机的更新服务。

## 一键启动（macOS）

在 Finder 中双击 `start.command` 即可：自动检查 Node 版本、按需安装依赖、处理端口占用、启动服务并自动打开浏览器；若程序已在运行则直接打开页面。手机/平板连接地址会显示在数据中心的“附近设备同步”面板里，不需要使用终端。

桌面封装（例如 `.app`）也应调用同一个 `scripts/launch-desktop.mjs` 入口，并传入 `--mode start --open`。这样封装版和 `start.command` 会共用端口切换、就绪检测、浏览器打开和局域网地址配置，不需要再单独维护一套启动逻辑。

首次双击如被 macOS 拦截，右键点 `start.command` 选“打开”，再确认一次即可。

## 账号登录

“账户号”支持账号或邮箱登录。注册时邮箱可以留空，登录后可在账号面板绑定或更换；侧栏会显示当前登录名，头像可在账号面板更换或恢复默认。本地密码采用 PBKDF2 加盐存储。

### 邮箱验证与找回密码

只要填了邮箱，注册、绑定/更换邮箱、重置密码三个场景都会走验证码：验证码 6 位、10 分钟有效、一码一用，输错 5 次作废，同一邮箱 60 秒内只能再发一次、每小时最多 5 封。验证码在数据库里只存哈希。重置密码成功后会注销该账号的全部登录会话。

发信走 Resend 的 HTTP API（Cloudflare Workers 运行时没有 TCP，发不了传统 SMTP）。邮箱验证和密码重置需要在 `.env.local` 里配置：

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

## 自动记账与同步

### 自动记账连接

登录后打开“数据中心 → 自动记账连接”，生成当前账号专用密钥。快捷指令、通知转发工具、Bark 或 NAS 向 `/api/external/quick-sync` 发送 `POST` 请求即可入账，密钥放在 `Authorization: Bearer <密钥>` 请求头中。页面可以直接复制快捷指令和通知转发模板。

Android 手机和平板可使用仓库中的 `android-companion`：它通过系统通知访问权限监听微信和支付宝支付通知，断网时先保存在本机队列，恢复后自动发送。生成密钥后点击“复制安卓配置”，再在伴侣应用中一键粘贴即可。iOS 不允许第三方 App 读取其他 App 的通知，因此 iPhone/iPad 使用快捷指令或共享入口发送到同一接口。

### NAS / Docker

NAS 安装 Docker 后，在项目目录运行：

```bash
docker compose up -d --build
```

默认访问 `http://NAS局域网地址:3000`，账本数据库保存在 Docker 卷 `neo-ledger-data`，删除或升级容器不会删除该卷。需要让手机在外网自动记账时，请使用 NAS 反向代理配置 HTTPS 域名，或通过可信 VPN 访问；不要把 HTTP 端口直接暴露到公网。`LAN_ORIGIN`、邮件验证和单用户兼容密钥等参数可以写入同目录的 `.env`，格式参照 `.env.example`。

接口支持三种常用数据格式：

```json
{"ledgerId":1,"amount":35.5,"merchant":"星巴克","category":"咖啡","source":"ios-shortcut","externalId":"唯一事件ID"}
```

```json
{"ledgerId":1,"text":"微信支付 向 星巴克 付款 ¥35.50","source":"notification-forwarder","externalId":"唯一通知ID"}
```

```json
{"ledgerId":1,"amount":200,"merchant":"工资","type":"收入","incomeCategory":"工资收入","externalId":"唯一事件ID"}
```

也可以把唯一事件 ID 放在 `Idempotency-Key` 请求头中；同一个 ID 重试不会产生重复流水。未指定账户时使用账本中的第一个资产账户。旧的全局 `SYNC_TOKEN` 仍可用于单用户兼容部署，多账号使用页面生成的账号专用密钥。

### 多端云同步

“数据中心 → 多端云同步控制塔”使用 WebDAV 保存端到端加密的完整账本。填写 WebDAV 地址、用户名、应用密码和至少 8 位的本地同步密钥后，点“立即安全同步”；首次会创建备份，之后会先下载、双向合并再上传。开启自动同步后，会按 1、5、15 或 30 分钟间隔，并在页面重新聚焦或恢复联网时检查同步。

WebDAV 地址与用户名保存在浏览器本地；应用密码和本地同步密钥只保存在当前标签页的 `sessionStorage`，关闭标签页即清除。每台设备必须使用完全相同的本地同步密钥，否则无法解密云端备份。

### 附近设备同步

两台设备登录同一个账号，打开同一个“数据中心”并保持房间码一致，在线设备会自动显示。发送设备生成加密同步包后点击“通过局域网发送”，接收设备输入 8 位配对码，从“局域网待接收同步包”获取并合并，不需要第三方文件传输软件。

同一局域网通常不需要额外配置。复杂网络可在 `.env.local` 中设置逗号分隔的 STUN 地址，例如 `P2P_STUN_URLS=stun:stun.example.com:3478`；STUN 只帮助发现公网地址，不中转账本数据，严格 NAT 环境仍建议使用加密同步包或 WebDAV。

附近同步面板会显示“本机局域网连接地址”，可直接复制给另一台设备。本地开发服务会自动识别当前电脑的 `192.168.x.x`、`10.x.x.x` 或 `172.16.x.x` 局域网地址；如果电脑有多个网卡，建议在 `.env.local` 固定 `LAN_ORIGIN=http://局域网IP:3000`。

现在也支持应用内局域网传输：发送设备生成同步包后点击“通过局域网发送”，接收设备在同一账号和房间码下会看到“局域网待接收同步包”，输入 8 位配对码后点击“获取并合并”。密文包仅在本机服务临时保存 15 分钟，成功合并后自动清理，适用于 Android、iOS、Windows、macOS、Linux 和平板。

手机通过局域网 `http://` 地址访问时，程序会自动使用兼容加密实现，不依赖浏览器的 `crypto.subtle`；如需额外备份，也可以点击“下载同步包”导出密文文件。

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
