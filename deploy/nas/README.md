# Neo Ledger 极空间部署包

此目录用于极空间 Docker/NAS 备用端。它与 OCI 主端使用独立的 `.env`、`data`、`backup`、`config` 和 `secrets`。项目端口由 NAS 的 Compose 项目配置决定；当前极空间项目映射 `3001:3000`。

## 部署规则

1. 在 NAS 为 Neo Ledger 准备独立项目目录，放入 `.env`，创建 `data`、`backup`、`config`、`secrets` 子目录。`.env` 参照仓库根目录 `.env.example` 配置。
2. 可用极空间文件管理器上传源码 ZIP，在 NAS 解压到项目目录的版本子目录，再从 Docker 项目详情执行重新构建。
3. 也可在 SSH 已安全配置且 NAS 和部署电脑网络可达时，使用下面的 SSH/SCP 自动部署命令。
4. NAS 端默认作为备用端和恢复端，不与 OCI 同时写入同一个账号或账本。
5. 优先使用 Neo Ledger 的加密备份/WebDAV 流程把 OCI 主端备份写入 NAS；需要切换时先停止 OCI 写入，再从 NAS 恢复并验收。

## 极空间文件上传部署与更新

在仓库根目录生成只包含已提交源码的上传包：

```bash
./deploy/nas/package-upload.sh
```

脚本把 ZIP 写入 `release-artifacts/nas-upload/`，文件名带源码提交号。包内包含根目录 `Dockerfile`，不包含根目录 `docker-compose.yml`、运行数据、`.env` 或密钥。上传到 NAS 的 `/SATA-1-4T/Docker/neo-ledger/` 并解压后，在 Docker → Compose → `neo-ledger` 项目详情的 Compose 配置中，把 `build.context` 指向新解压目录并保留既有端口、环境变量和数据挂载，然后点“重新构建”。确认新容器运行正常后，可删除较早的源码 ZIP/目录以释放空间；不要删除 `data` 或 `backup`。

当前极空间部署使用目录 `neo-ledger-nas-source-1.5.0-63c1eb2`，Compose 保留 `3001:3000`、`./data:/app/.wrangler` 与 `./backup:/app/backup`。

## 终端部署与更新

在安全且网络可达的情况下，于极空间启用 SSH，并在 Mac 的 `~/.ssh/config` 配置一个可用主机别名，或直接使用 `user@NAS地址`。确认 SSH 账号有 Docker 权限，且目标目录已有 `.env`。然后在仓库根目录运行：

```bash
NEO_NAS_SSH='peng@192.168.1.50' \
NEO_NAS_DIR='/SATA-1-4T/Docker/neo-ledger' \
./deploy/nas/deploy.sh
```

`NEO_NAS_SSH` 支持 SSH 配置别名。脚本只上传已提交的 Git 版本；工作区有已暂存或未暂存的跟踪文件修改时会停止。源码解压到 NAS 项目目录下的 `.releases/`，Compose 使用该版本的代码构建独立版本标签的镜像。`.env`、`data`、`backup`、`config` 和 `secrets` 保存在项目目录并链接到每个发布目录，更新时不会替换或清空这些内容。部署后脚本等待容器健康检查，并请求容器内健康接口；最近五个源码版本和对应镜像保留在 `.releases/` 中。回滚时将 Compose 指向目标 `.releases/<时间戳>`，并设置 `NEO_LEDGER_RELEASE=<时间戳>` 后执行 `docker compose ... up -d --no-build neo-ledger`。

首次部署前，请先在 NAS 上创建项目目录、配置 `.env` 并创建上述持久目录。若 SSH 账号不能运行 Docker，可在 NAS 上为该账号配置 Docker 权限，或通过极空间 SSH 终端以有权限的账号运行；不要把私钥放入仓库或上传到 NAS 项目目录。

不要把 NAS 端直接暴露为第二个生产主地址，也不要直接 rsync 正在运行的 SQLite 文件。NAS 与部署电脑不在同一局域网时，使用文件上传包；不要为了自动部署把 NAS SSH 服务暴露到公网。
