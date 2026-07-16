# Neo Ledger

Neo Ledger 是一个本地优先的个人账本，支持多账本、账户与信用卡、储蓄目标、订阅和分期，以及微信、支付宝、美团、京东、银行卡等账单导入。

## 本地运行

需要 Node.js 22.13 或更高版本，以及系统命令 `git`、`sqlite3`。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。`npm run dev` 会同时启动主程序和仅监听本机的更新服务。

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
