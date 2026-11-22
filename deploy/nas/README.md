# Neo Ledger 极空间主站部署包

用户已指定 **极空间 NAS 为主数据，OCI 为备份和恢复端**。NAS 与 OCI 账号库仍然独立；OCI 只接收 NAS 推来的加密数据库快照，不参与日常记账。手机、电脑和网页需连接同一个 NAS HTTPS 地址，才能共享 NAS 主账本。

邀请注册已合并，OCI 已部署；NAS 仍在旧版本。OCI 加密备份接收 API 已部署并可认证查询，但尚无 NAS 快照，sidecar 和恢复演练尚未在 NAS 实机验收。阶段和门槛见 [NAS 主数据与 OCI 灾备备份方案](../../docs/NAS_PRIMARY_OCI_BACKUP_PLAN.md)。现有 `nas.985251.xyz` 已用于 SafeVault，不可覆盖；`ledger.985251.xyz` 保持 OCI 入口。

## 部署规则

1. 在 NAS 为 Neo Ledger 准备独立项目目录，放入 `.env`，创建 `data`、`backup`、`config`、`secrets` 子目录。`.env` 参照仓库根目录 `.env.example` 配置。
2. 可用极空间文件管理器上传源码 ZIP，在 NAS 解压到项目目录的版本子目录，再从 Docker 项目详情执行重新构建。
3. 也可在 SSH 已安全配置且 NAS 和部署电脑网络可达时，使用下面的 SSH/SCP 自动部署命令。
4. NAS 是唯一写入端；OCI 只保存加密备份。禁止双主、直接复制运行中的 SQLite 文件或自动覆盖 NAS 主数据。
5. 每日 NAS→OCI 备份与恢复需按 [NAS 主数据与 OCI 灾备备份方案](../../docs/NAS_PRIMARY_OCI_BACKUP_PLAN.md) 实现并通过隔离演练后，才能切换原生客户端默认地址。

## 启用 NAS→OCI 加密备份

1. 先在 OCI Neo Ledger `.env` 配置随机 `NEO_NAS_BACKUP_TOKEN`（至少 40 个 URL 安全字符），然后更新 OCI 应用使 `/api/nas-backup` 接收器生效。此 API 只允许该 Token 上传/下载加密密文。
2. 在 NAS 项目根目录新建 `.neo-ledger-backup.env`，从 `deploy/nas/backup.env.example` 复制模板，填写与 OCI 完全相同的 Token，以及一条至少 20 字符的独立恢复口令。恢复口令另存密码管理器/离线位置，不要发到聊天或提交 Git。
3. 将 Compose 文件放在 NAS 项目根目录，并把 `NEO_NAS_PROJECT_DIR` 指向现有项目根目录、`NEO_LEDGER_SOURCE_DIR` 指向解压后的对应源码目录。独立 sidecar Compose 项目只挂载项目根目录的 `data`（只读）和 `backup/nas-to-oci`（写入），不加入主应用项目，也不依赖当前源码目录里的数据路径。等价终端命令：

   ```bash
   export NEO_NAS_PROJECT_DIR=/SATA-1-4T/Docker/neo-ledger
   export NEO_LEDGER_SOURCE_DIR=/SATA-1-4T/Docker/neo-ledger/neo-ledger-nas-source-<commit>
   docker compose --project-directory "$NEO_NAS_PROJECT_DIR" -p neo-ledger-backup \
     -f "$NEO_LEDGER_SOURCE_DIR/deploy/nas/compose.backup.yml" \
     up -d --build neo-ledger-backup-agent
   ```

   它只读挂载现有 `data`，没有 Docker socket；NAS 主应用仍按原数据卷运行。首次上传会立即运行，此后默认每天一次；失败会留在日志里并在下一周期重试。NAS 本地最多留 35 个加密快照，OCI 接收端最多留 14 个成功密文快照。
4. 查看 sidecar 日志中的 `OCI NAS backup succeeded`。用同一 Compose 配置执行 `run --rm neo-ledger-backup-agent prepare-restore`，按恢复口令从 OCI 下载最新密文到隔离目录。它只生成 `backup/restore-candidate-*`，不会替换 NAS 数据。核验 manifest 的账号/账本数量、SQLite 完整性和最新上传摘要，再进行隔离实例恢复演练。
5. 不能仅凭“容器正在运行”宣布备份可用。还需连续成功上传、验证 OCI 摘要、隔离解密与数据库打开成功；定期重复恢复演练。

OCI 最近一次已提交快照状态可通过带 Token 的 `GET https://ledger.985251.xyz/api/nas-backup?status=1` 查询；它只返回快照 ID、时间、字节数和摘要，不包含业务数据。复制某次 sidecar 成功日志里的 `snapshot` ID 到 `NEO_BACKUP_SNAPSHOT_ID`，可以选择保留期内的历史恢复点；留空则默认取最新。

恢复实操与回滚步骤见 [NAS 主数据与 OCI 灾备备份方案](../../docs/NAS_PRIMARY_OCI_BACKUP_PLAN.md)。严禁把候选库直接复制覆盖主数据目录；正式恢复必须先停写、停止主应用、保留完整停止态原目录并由用户确认具体快照。

## 极空间文件上传部署与更新

在仓库根目录生成只包含已提交源码的上传包：

```bash
./deploy/nas/package-upload.sh
```

脚本把 ZIP 写入 `release-artifacts/nas-upload/`，文件名带源码提交号。包内包含根目录 `Dockerfile`，不包含根目录 `docker-compose.yml`、运行数据、`.env` 或密钥。上传到 NAS 的 `/SATA-1-4T/Docker/neo-ledger/` 并解压后，在 Docker → Compose → `neo-ledger` 项目详情中，先确认 `/app/.wrangler` 仍挂载到原来的持久化 `data` 目录，保存 Compose 配置，并通过应用导出或已验证的停止态数据库快照留存可恢复备份。**未确认备份可读、原挂载路径一致时，不得点击“重新构建”或切换数据目录。**重建后检查账号仍存在，并用脱敏方式核对账本数量；如原来有账号而现在显示无账号，立即停止写入，保留原目录和备份，不要注册替代账号。源码 ZIP/目录可在验证后清理；永远不要把 `data` 或 `backup` 当作源码清理对象。

当前极空间部署使用目录 `neo-ledger-nas-source-1.5.0-63c1eb2`，Compose 保留 `3001:3000`、`./data:/app/.wrangler` 与 `./backup:/app/backup`。

## 终端部署与更新

在安全且网络可达的情况下，于极空间启用 SSH，并在 Mac 的 `~/.ssh/config` 配置一个可用主机别名，或直接使用 `user@NAS地址`。确认 SSH 账号有 Docker 权限，且目标目录已有 `.env`。然后在仓库根目录运行：

```bash
NEO_NAS_SSH='peng@192.168.1.50' \
NEO_NAS_DIR='/SATA-1-4T/Docker/neo-ledger' \
./deploy/nas/deploy.sh
```

`NEO_NAS_SSH` 支持 SSH 配置别名。脚本只上传已提交的 Git 版本；工作区有已暂存或未暂存的跟踪文件修改时会停止。源码解压到 NAS 项目目录下的 `.releases/`，Compose 使用该版本的代码构建独立版本标签的镜像。更新前脚本会检查容器实际数据挂载是否仍指向项目 `data`，停容器后创建并校验包含 `data`、配置与密钥的备份，再启动新版本；如果更新前有账号、更新后账号消失，脚本会停止新容器并报错。`.env`、`data`、`backup`、`config` 和 `secrets` 保存在项目目录并链接到每个发布目录。回滚时将 Compose 指向目标 `.releases/<时间戳>`，并设置 `NEO_LEDGER_RELEASE=<时间戳>` 后执行 `docker compose ... up -d --no-build neo-ledger`。部署脚本不能替代跨端同步，也不能替代异地备份。

首次部署前，请先在 NAS 上创建项目目录、配置 `.env` 并创建上述持久目录。若 SSH 账号不能运行 Docker，可在 NAS 上为该账号配置 Docker 权限，或通过极空间 SSH 终端以有权限的账号运行；不要把私钥放入仓库或上传到 NAS 项目目录。

不要把 NAS 端直接暴露为第二个生产主地址，也不要直接 rsync 正在运行的 SQLite 文件。NAS 与部署电脑不在同一局域网时，使用文件上传包；不要为了自动部署把 NAS SSH 服务暴露到公网。
