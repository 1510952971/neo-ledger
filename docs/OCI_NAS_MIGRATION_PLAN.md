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

- [ ] `ledger.985251.xyz` DNS 指向 Cloudflare，Cloudflare 回源到 OCI。
- [ ] Caddy 成功签发证书，`/api/health` 返回 `status=ok`。
- [ ] OCI 容器使用 `/opt/apps/neo-ledger/data`，未挂载其他软件数据目录。
- [ ] 电脑端、Android 端、网页版默认使用新地址。
- [ ] 新建账号、账本、账户和流水可在设备间同步。
- [ ] NAS 独立部署或备份任务成功，能恢复一份全新测试账本。
- [ ] 更新服务同时提供软件服务地址和 GitHub 备用地址。
- [ ] 连续观察 24 小时后再决定停用 AWS 旧服务。
