# Neo Ledger 极空间部署包

此目录用于极空间 Docker/NAS 备用端。它与 OCI 主端使用独立的 `data`、`backup`、`config` 和 `secrets`，默认监听 NAS 局域网的 `3000` 端口。

## 部署规则

1. 将整个 Neo Ledger 源码目录复制到极空间专用目录，不要与其他项目共用目录或卷。
2. 复制 `.env.example` 为 `.env`，把 `nas-ledger.985251.xyz` 改成实际 NAS 域名；如果只在局域网使用，可填写 NAS 的 HTTPS 反向代理地址。
3. 创建 `data`、`backup`、`config`、`secrets` 目录后执行 `docker compose -f deploy/nas/compose.yml up -d --build`。
4. NAS 端默认作为备用端和恢复端，不与 OCI 同时写入同一个账号或账本。
5. 优先使用 Neo Ledger 的加密备份/WebDAV流程把 OCI 主端备份写入 NAS；需要切换时先停止 OCI 写入，再从 NAS恢复并验收。

不要把 NAS 端直接暴露为第二个生产主地址，也不要直接 rsync 正在运行的 SQLite 文件。
