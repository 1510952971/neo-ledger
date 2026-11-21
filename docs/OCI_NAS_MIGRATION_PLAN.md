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
- [ ] 使用同一个 OCI 生产服务和账号完成真实跨设备登录/记账验收（常规使用不需要 WebDAV）。
- [x] NAS Neo Ledger 独立容器已部署并运行。
- [x] NAS 隔离演练账本内新增账户、写入 ¥0.01 测试流水，并在账单页读回流水与账户余额。
- [x] NAS 备份恢复往返完成：恢复前导出 JSON，在用户明确确认全量覆盖后执行恢复；恢复后账本与验收流水可读。
- [x] 极空间远程访问入口可打开 NAS Neo Ledger 应用；无需电脑与 NAS 同一局域网。
- [ ] 真实账号跨设备同步验收；WebDAV 仅用于额外的加密快照/合并，不是日常多端同步的前置条件。
- [x] NAS 文件上传更新流程已完成首次实机验证；重复打包命令已加入 `deploy/nas/package-upload.sh`。
- [x] 更新服务同时提供软件服务地址和 GitHub 备用地址；`native-v1.5.0` 已发布。
- [x] OCI 部署连续运行超过 24 小时且健康；是否停用旧 AWS 仍待 NAS 同步与恢复验收后决定。

## 2026-11-19 执行记录

- DNS A 记录 `ledger.985251.xyz` 指向 OCI `164.152.107.32`，使用 Cloudflare 代理。
- 修复了 Caddy 单文件 bind mount 未更新的问题；重建 Caddy 后 Let’s Encrypt 证书签发成功。公网 `/api/health` 返回 `status=ok`，数据库、schema 与配置检查均正常。
- 发布 `native-v1.5.0` 成功：Android APK/AAB、macOS DMG/ZIP、Windows EXE/ZIP 和 Web/NAS 包均已附加到 GitHub Release；两个更新镜像均报告可用。
- 该版本本地验证通过：Node 测试 567 项与 API 集成 122/148/231 项，Flutter analyze 无问题，Flutter 测试 119 项通过。
- OCI 容器已从 `native-v1.5.0` 源码重新构建，容器 `neo-ledger` 当前健康运行，镜像 ID 为 `sha256:acac5505a3ff5a32fe58f970e36476579a3ba7f4c9f73f48128c6faa3f044d1e`。在实例内部访问 `/api/health` 返回 `status=ok`，数据库、schema 与配置检查均正常。`/api/health` 的 `version=1.1.0` 是服务包版本字段；客户端更新接口则返回 `latestVersion=1.5.0`、`tag=native-v1.5.0`。更新前的 OCI 备份 `/opt/apps/neo-ledger/backup/neo-ledger-20261119T150825Z.tar.gz` 已生成并通过校验。
- NAS 已建立独立项目目录 `/SATA-1-4T/Docker/neo-ledger`。最初 `neo-ledger-nas` 容器使用 `native-v1.5.0` Git 构建上下文；旧 BuildKit `npm ci` 记录是先前尝试，不代表容器仍卡在构建中。
- 参考 [SafeVault NAS 部署指南](https://github.com/1510952971/safevault/blob/main/docs/NAS_DEPLOY.md) 的终端部署包上传、代码与持久目录分离方式，已新增 `deploy/nas/deploy.sh`。它通过 SSH/SCP 上传已提交源码到 NAS 的 `.releases/`，保留 `.env`、`data`、`backup`、`config` 和 `secrets`，随后构建、重启 Neo Ledger 容器并检查健康状态。Compose 路径已调整以让版本目录代码挂载项目根目录的数据。NAS 目前没有已确认可用的 SSH 主机别名/登录，终端流程尚未在 NAS 实际执行；需启用极空间 SSH 并配置可登录账号后运行脚本。
- 设备间真实账号同步、NAS 局域网可达性和 NAS 备份恢复演练尚未验收。继续保留旧 AWS 服务；不要让 NAS 与 OCI 同时写同一账本。

## 2026-11-21 复查

- OCI `neo-ledger` 容器自 `2026-11-19T15:16:08Z` 启动后持续运行约 32 小时，Docker `RestartCount=0`，容器为 `healthy`，最近健康检查均通过。实例内及公网 `/api/health` 均返回 `status=ok`；更新接口持续返回 `latestVersion=1.5.0`，两个下载镜像均可用。24 小时运行观察通过。
- 极空间当前无法通过本机 SSH/SCP 直连；使用文件管理器上传已提交源码 ZIP 到 `/SATA-1-4T/Docker/neo-ledger` 并在 NAS 解压，随后把 Compose 构建上下文切到源码目录。极空间 Docker 的 `neo-ledger` 项目已从本地上传源码重新构建，`neo-ledger-nas` 显示运行中；日志视图可见应用 API 请求返回 `200 OK`。端口 `3001:3000`、`data` 和 `backup` 挂载均保留。由此文件上传已替代 SSH 上传，NAS 部署更新路径完成首次实机验证。
- 文件上传部署的源码版本为仓库提交 `63c1eb2`（ZIP `neo-ledger-nas-source-1.5.0-63c1eb2.zip`）。后续更新流程：从目标提交生成不含根 Compose/运行数据的源码包，上传至同一项目目录并解压，然后把 Compose 的 `build.context` 指向新源码目录并在极空间 Docker 项目详情执行“重新构建”。保留 `data` 与 `backup` 映射；NAS 项目 Compose 已备份为 `docker-compose-1.yml`。
- NAS 已通过极空间 Docker 容器的远程访问入口打开 Neo Ledger 页面，Mac/NAS 同局域网不是远程使用的前提。NAS 与 OCI 是两套独立数据库；旧记录中的跨设备同步/恢复验收状态以 2026-11-21 后续验收记录为准。继续保留旧 AWS 服务；NAS 与 OCI 保持独立数据，不做双主写入。无需为此开放 SSH。

## 2026-11-21 后续验收

- 极空间“系统设置 → 网络设置”显示 IPv4 `192.168.5.134`（DHCP）。当前 NAS 应用端口为 `3001`，理论局域网入口为 `http://192.168.5.134:3001`。从本次执行环境访问 `/api/health` 连接超时，说明部署电脑不在该 NAS 的可达局域网；没有设置公网端口转发或开启 SSH。
- 后续通过极空间 Docker 容器列表里的“远程访问”入口打开了 Neo Ledger，应用页面在本地代理地址 `http://127.0.0.1:10000/` 正常显示。此远程入口可以用于页面级操作和检查；故将“电脑/NAS 同局域网”移出部署及远程访问前提。
- Neo Ledger 主页显示首次使用引导、默认现金账户已就绪、无收支记录。常规多端同步使用同一 Neo Ledger 服务端和账号；WebDAV 另用于外部加密快照/合并；“附近设备同步”才要求同一局域网。
- 极空间文件管理器显示 `/SATA-1-4T/Docker/neo-ledger/backup` 为空。应用状态目录 `/SATA-1-4T/Docker/neo-ledger/data/state/v3/d1/miniflare-D1DatabaseObject` 内已有 SQLite 数据库（约 748 KB）及 WAL（约 3.9 MB）；只检查文件名和大小，未打开或导出账本内容。不能把正在运行的 SQLite/WAL 文件当成一致性备份；恢复演练仍需先生成应用级全量导出或一致性快照，再放入隔离目录和端口测试。
- 代码复核确认，JSON 恢复接口会删除当前 owner 的全部账本和关联数据后再导入；它不是按单个账本恢复。2026-11-21 已先导出当前 NAS 全量 JSON，并在用户确认全量覆盖后实际恢复；预检显示 65 条记录、预计 97 条数据库语句。恢复后账单页仍显示 `NAS部署写入验收测试` ¥0.01。该恢复过程验证了现有全量备份可导入；未来只应在明确确认后恢复。
- 早期隔离写入尝试未能读回；后续已在 `NAS写入验收-20261121` 新建账户“验收钱包”，成功记入并读回 ¥0.01 测试流水，因此以“2026-11-21 写入与备份验收”中的后续成功结果为准。
- 实际跨设备同步应在所有设备登录同一 OCI 生产站点 `https://ledger.985251.xyz` 的同一账号；真实账号验收尚未完成。NAS 是独立恢复端，其数据库不会自动镜像到 OCI；如需 NAS 和 OCI 两库双向同步，应采用独立的版本控制复制协议，不应把 WebDAV 账号字段误当作普通跨设备登录条件。

## 2026-11-21 写入与备份验收

- 在远程入口新建的 `NAS写入验收-20261121` 账本起初没有账户，因此首次记账无法提交；为该隔离账本新增零余额账户“验收钱包”后，成功记入 `NAS部署写入验收测试` ¥0.01 支出。主页显示今日支出 ¥0.01、账户余额 -¥0.01；账单明细显示该记录，NAS 写入及读取验收通过。测试账本与主账本分开。
- 应用控制台可见若干 API 请求间歇性 500 / `ERR_EMPTY_RESPONSE`；直接健康检查返回 `status=ok`，并且当前账单写入和读回成功。该错误表现为间歇性，尚未取得 NAS 容器服务端堆栈日志，需在后续观察中确认原因。
- 恢复前全量导出保存在本机下载目录 `neo-ledger-nas-pre-restore-20261121.json`，统计包含 3 个账本、2 个账户和 1 笔验收测试流水。已通过应用预检并完成全量恢复，恢复后再次确认 `NAS写入验收-20261121` 账本的这笔流水可读。该 JSON 文件保留在本机下载目录作为本次恢复前副本。
- WebDAV 外部加密同步仍未配置；它不是使用 OCI 生产服务进行日常跨端同步的必需条件。NAS 本地数据与 OCI 生产数据保持独立。
