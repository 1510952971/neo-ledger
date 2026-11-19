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
- [ ] NAS 独立部署或备份任务成功，能恢复一份全新测试账本。
- [x] 更新服务同时提供软件服务地址和 GitHub 备用地址；`native-v1.5.0` 已发布。
- [ ] 连续观察 24 小时后再决定停用 AWS 旧服务。

## 2026-11-19 执行记录

- DNS A 记录 `ledger.985251.xyz` 指向 OCI `164.152.107.32`，使用 Cloudflare 代理。
- 修复了 Caddy 单文件 bind mount 未更新的问题；重建 Caddy 后 Let’s Encrypt 证书签发成功。公网 `/api/health` 返回 `status=ok`，数据库、schema 与配置检查均正常。
- 发布 `native-v1.5.0` 成功：Android APK/AAB、macOS DMG/ZIP、Windows EXE/ZIP 和 Web/NAS 包均已附加到 GitHub Release；两个更新镜像均报告可用。
- 该版本本地验证通过：Node 测试 567 项与 API 集成 122/148/231 项，Flutter analyze 无问题，Flutter 测试 119 项通过。
- 公网更新接口已返回最新 `1.5.0`，但当前 OCI `/api/health` 仍显示服务端应用版本 `1.1.0`。本机 SSH 公钥不在 OCI 实例授权列表中，尚未更新 OCI 应用容器。
- NAS 已建立独立的 `/Docker/neo-ledger` 项目目录，Compose 使用 `native-v1.5.0` Git 构建上下文，数据与备份各自落在项目目录下。借助本机缓存的 `node:latest`，BuildKit 已成功取到基础镜像元数据和 Git tag；构建目前停在 `npm ci`，尚未生成或启动容器。需恢复 NAS 的 npm 包访问后再完成健康与恢复演练。
- 设备间真实账号同步和 24 小时观察尚未验收。继续保留旧 AWS 服务；不要让 NAS 与 OCI 同时写同一账本。
