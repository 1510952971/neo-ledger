# Neo Ledger 甲骨文云 + 极空间迁移方案

本方案按《多软件云端部署与同步备份通用模板》执行。目标地址暂定为 `https://ledger.985251.xyz`；在 DNS、HTTPS 和健康检查全部通过前，不切换客户端的生产入口。

## 目标架构

```text
电脑 / Android / Web
          │ HTTPS
          ▼
ledger.985251.xyz
          │ Cloudflare → OCI Caddy
          ▼
OCI /opt/apps/neo-ledger/neo-ledger
          │ 主数据库（唯一写入端）
          ├── /opt/apps/neo-ledger/data
          └── /opt/apps/neo-ledger/backup

极空间 NAS
          │ 独立 Neo Ledger 容器或备份任务
          └── data / backup（备用端，不与 OCI 双主写入）
```

## 执行原则

- 不迁移旧 AWS 测试账本，不把旧数据恢复到新端。
- 不删除旧 AWS 服务，至少保留到新 OCI/NAS 验收完成。
- Neo Ledger 只使用自己的目录、容器、数据卷和备份目录。
- Caddy/Cloudflare 只作为共享入口层，不共享应用数据。
- 甲骨文端作为唯一主写入端；NAS 作为备份和恢复端。
- 每次更新前先备份，更新后检查健康、登录、写入、读取和恢复。

## 验收门槛

- [x] `ledger.985251.xyz` DNS 指向 Cloudflare，Cloudflare 回源到 OCI。
- [x] Caddy 成功签发证书，`/api/health` 返回 `status=ok`。
- [x] OCI Neo Ledger 数据位于独立的 `/opt/apps/neo-ledger/data` 目录。
- [x] 电脑端、Android 端、网页版的默认生产地址已切到 `https://ledger.985251.xyz`。
- [ ] 新建账号、账本、账户和流水可在设备间同步。
- [x] NAS Neo Ledger 独立容器已部署并运行。
- [ ] NAS 备份恢复演练成功，能恢复一份全新测试账本。
- [ ] NAS 局域网访问、真实账号同步和终端上传更新流程验收完成。
- [x] 更新服务同时提供软件服务地址和 GitHub 备用地址；`native-v1.5.0` 已发布。
- [x] OCI 部署连续运行超过 24 小时且健康；是否停用旧 AWS 仍待 NAS 同步与恢复验收后决定。

## 2026-11-19 执行记录

- DNS A 记录 `ledger.985251.xyz` 指向 OCI `164.152.107.32`，使用 Cloudflare 代理。
- 修复了 Caddy 单文件 bind mount 未更新的问题；重建 Caddy 后 Let’s Encrypt 证书签发成功。公网 `/api/health` 返回 `status=ok`，数据库、schema 与配置检查均正常。
- 发布 `native-v1.5.0` 成功：Android APK/AAB、macOS DMG/ZIP、Windows EXE/ZIP 和 Web/NAS 包均已附加到 GitHub Release；两个更新镜像均报告可用。
- 该版本本地验证通过：Node 测试 567 项与 API 集成 122/148/231 项，Flutter analyze 无问题，Flutter 测试 119 项通过。
- OCI 容器已从 `native-v1.5.0` 源码重新构建，容器 `neo-ledger` 当前健康运行，镜像 ID 为 `sha256:acac5505a3ff5a32fe58f970e36476579a3ba7f4c9f73f48128c6faa3f044d1e`。在实例内部访问 `/api/health` 返回 `status=ok`，数据库、schema 与配置检查均正常。`/api/health` 的 `version=1.1.0` 是服务包版本字段；客户端更新接口则返回 `latestVersion=1.5.0`、`tag=native-v1.5.0`。更新前的 OCI 备份 `/opt/apps/neo-ledger/backup/neo-ledger-20261119T150825Z.tar.gz` 已生成并通过校验。
- NAS 已建立独立项目目录 `/SATA-1-4T/Docker/neo-ledger`。`neo-ledger-nas` 容器当前运行，日志报告 Wrangler 监听 `0.0.0.0:3000`；Compose 使用 `native-v1.5.0` Git 构建上下文，数据和备份分别保存在项目目录。旧 BuildKit `npm ci` 记录是先前尝试，不代表当前容器仍卡在构建中。
- 参考 [SafeVault NAS 部署指南](https://github.com/1510952971/safevault/blob/main/docs/NAS_DEPLOY.md) 的终端部署包上传、代码与持久目录分离方式，已新增 `deploy/nas/deploy.sh`。它通过 SSH/SCP 上传已提交源码到 NAS 的 `.releases/`，保留 `.env`、`data`、`backup`、`config` 和 `secrets`，随后构建、重启 Neo Ledger 容器并检查健康状态。Compose 路径已调整以让版本目录代码挂载项目根目录的数据。NAS 目前没有已确认可用的 SSH 主机别名/登录，终端流程尚未在 NAS 实际执行；需启用极空间 SSH 并配置可登录账号后运行脚本。
- 设备间真实账号同步、NAS 局域网可达性和 NAS 备份恢复演练尚未验收。继续保留旧 AWS 服务；不要让 NAS 与 OCI 同时写同一账本。

## 2026-11-21 复查

- OCI `neo-ledger` 容器自 `2026-11-19T15:16:08Z` 启动后持续运行约 32 小时，Docker `RestartCount=0`，容器为 `healthy`，最近健康检查均通过。实例内及公网 `/api/health` 均返回 `status=ok`；更新接口持续返回 `latestVersion=1.5.0`，两个下载镜像均可用。24 小时运行观察通过。
- 极空间目前没有可确认的 SSH 入口：NAS 主机名 `Q4-VA2B.local` 在本机无法解析，当前局域网探测没有发现可用 SSH 服务。未向不明设备上传文件或尝试密码登录。`deploy/nas/deploy.sh` 已提交并推送，但必须在极空间启用 SSH 并提供可用的主机地址/别名及登录账号后，才能执行端到端上传更新验收。
- 因 NAS 局域网访问、真实账号同步和备份恢复演练仍未完成，旧 AWS 服务继续保留；NAS 与 OCI 也继续保持独立数据，不做双主写入。
