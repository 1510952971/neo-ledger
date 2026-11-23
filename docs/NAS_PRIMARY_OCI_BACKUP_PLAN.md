# NAS 主数据与 OCI 灾备备份方案

## 目标与数据边界

- 极空间 NAS 是唯一主数据库，所有需要共享同一账本的平台都连接 NAS 上的 Neo Ledger HTTPS 地址。
- OCI 只保存 NAS 数据库的加密、版本化备份；日常不登录 OCI 记账，不接受 NAS 用户的业务写入。
- 备份是单向的 `NAS → OCI`。OCI 不与 NAS 双主写入，也不做自动反向合并。
- NAS 现有 SQLite/D1 数据、账号、账本和关联表作为唯一权威数据；切换过程不迁移、不重建、不覆盖 NAS 数据。
- OCI 现有账号库保持原样，与 NAS 账号库不同。OCI 的备份接收器保存不透明密文，不创建同名用户。

## 目标架构

```text
Android / iOS / macOS / Windows / 浏览器
                     │ HTTPS，同一主机名
                     ▼
      ledger-nas.985251.xyz（Cloudflare Tunnel）
                     │
                     ▼
      极空间 NAS neo-ledger 容器（唯一写入端）
                     │ SQLite 在线一致性快照
                     │ AES-256-GCM 加密后 HTTPS PUT
                     ▼
      ledger.985251.xyz/api/nas-backup（OCI 接收端）
                     │ 只保存密文与校验元数据
                     ▼
      OCI 本地持久数据库 + OCI 本地每日整机备份
```

`nas.985251.xyz` 当前已经路由到 SafeVault，不能复用或覆盖。`ledger.985251.xyz` 当前是 OCI 服务，也不能改作 NAS 入口。NAS Neo Ledger 实际发布端口为主机 `3001 → 容器 3000`；新入口应指向 `http://192.168.5.134:3001`，通过外网健康检查后才能启用客户端切换。

## 公网入口安全方案与启用门槛

Tunnel 会隐藏 NAS 的私网 IP、不需要路由器端口映射，并把流量带到 Cloudflare 边缘；它不会让公开主机名变成私有应用。`ledger-nas.985251.xyz` 的登录页与 API 仍会被互联网访问，因此须先完成以下防护，再加路由：

| 风险 | 应对措施 | 当前状态 |
| --- | --- | --- |
| NAS 源站被直接扫描/暴露 | 只用 Cloudflare Tunnel 的出站连接；不要创建 NAS 公网 A/AAAA 记录，不做路由器端口转发；保留 `192.168.5.134` 私网地址。Tunnel 提供公开 hostname 时，Cloudflare 可在边缘应用 WAF/DDoS 能力。 | 计划；尚未为 Neo Ledger 创建新路由 |
| 登录密码猜测、撞库 | 应用当前按 IP 对登录限制 12 次/15 分钟、注册限制 5 次/15 分钟。Cloudflare Free 当前可建 1 条规则，但只支持按路径匹配且按 IP 计数，不能按主机名或 HTTP 方法限定；同一规则可能影响 OCI、NAS 与该域下其他服务，所以不能未经兼容性验证就套用。不要对原生客户端 API 盲目套浏览器 JavaScript Challenge。 | 应用限流已有；Cloudflare 免费区规则 0/1，因域名范围过宽暂不启用 |
| 未授权注册、邮件滥发 | 已注册用户登录账号面板后可针对一个目标邮箱生成一次性邀请码；码有效 7 天、单次使用、每用户每日最多 5 个。服务端先验证邀请与邮箱绑定，再允许发送注册邮件验证码；注册时在一个数据库批次中消费邀请并创建账号。错误/过期/已用码不发邮件。登录和找回密码不需要邀请。空数据库首账号只能由管理员配置的 24 小时 bootstrap 邀请创建。 | 已合并并部署 OCI；NAS 尚未更新 |
| 会话被盗/弱口令 | 使用唯一强密码；为主账号启用 Passkey 或 TOTP 二次验证，离线保存恢复码；不要共享管理员密码。 | 需在原 NAS 账号验收时配置/确认 |
| WAF 误伤同步/手机 API | 对登录、数据 API、Passkey、邮件验证码和更新下载路径做移动端与 Web 实测；Cloudflare Access 如拦截 API 则不启用全站 Access。任何规则先观察日志、再逐步阻断。 | 尚未验证 |
| OCI 源站被绕过 | 原生客户端只使用 HTTPS 域名；Cloudflare 的 OCI 源站地址不写入客户端。备份端点只收随机 bearer token 认证的 AES-GCM 密文；对 token 失效、请求大小和摘要做拒绝处理。 | OCI 接收器已部署；未授权请求被拒绝 |

**上线次序**：先部署邀请码功能并确认主账号可生成邀请；启用主账号 MFA；检查 Cloudflare 账户当前可用的 WAF/速率规则并验证 API 兼容性；配置边缘防护；然后才新增 Tunnel hostname。新 hostname 验证 TLS、健康检查、Web/手机 API 和登录后，再考虑切换客户端。Cloudflare 文档说明 Tunnel 建立的是出站连接，无需公网 IP 或打开入站端口；速率限制可针对登录端点抑制暴力尝试，但规则命中/计数存在延迟，不能替代应用级限流。[Cloudflare Tunnel 文档](https://developers.cloudflare.com/tunnel/)、[Cloudflare WAF 速率限制文档](https://developers.cloudflare.com/waf/rate-limiting-rules/)。

## 备份协议

1. NAS 备份 sidecar 以只读方式挂载 NAS 的 `/app/.wrangler` 数据目录；没有 Docker socket、应用凭据或记账 API 写权限。
2. sidecar 使用 SQLite Online Backup API 生成一致性快照，运行 `integrity_check`，检查数据库文件数、schema 和账号数量。多数据库、路径不明、完整性异常、无账号或超出大小限制时失败关闭，不上传。
3. 只打包数据库快照与非敏感 manifest，不打包 NAS `.env`、Resend 密钥、Token、SSH 密钥或无关配置。
4. sidecar 用独立恢复口令通过 scrypt 派生密钥，以 AES-256-GCM 加密；OCI 只收到密文。恢复口令不能只保存在 NAS 或 OCI，必须另存在用户控制的密码管理器/离线位置。
5. 上传使用独立的随机 bearer token；OCI 只接受配置好的 NAS 备份路径，校验 token、大小、摘要和加密封套版本。Token 不用于登录或记账，撤销时可单独更换。
6. OCI 仅保留最近 3 个成功快照。上传先写暂存记录，全部区块保存后才标记为可恢复；部分上传绝不覆盖最近的成功快照。带 Token 的状态接口返回最近成功时间和摘要。
7. NAS 本地也仅保留最近 3 个每日加密快照。OCI 保留不是区域/账号级异地复制，且占用 OCI 磁盘空间；需要监测剩余空间和最近成功时间。当前代码不发送主动告警，NAS/OCI 上线前应确认容器日志可见并建立每周人工检查。

## 恢复流程

恢复是受控的全量数据库替换，不是合并，也不自动发生：

1. 停止所有设备对 NAS 主站的写入；确认 OCI 最新可用快照时间及其摘要。
2. 用 NAS 已保存的 bearer token 从 OCI 下载密文；用用户独立恢复口令解密。
3. 在临时目录解包并验证 SQLite `integrity_check`、schema、用户数和账本数；不合格则停止。
4. 停止 NAS Neo Ledger 容器，先对当前 NAS `data` 目录做可读的停止态备份，并将原始目录保留为回滚材料。
5. 将已验收的候选数据库放回原数据库路径；保持 Compose 的 `/app/.wrangler` 持久卷映射完全不变。
6. 启动 NAS，检查健康、原账号登录、账本及账单读取；验证通过后恢复设备写入。验证失败则停写并用原目录回滚。
7. 在受控测试窗口用无财务影响的验收账号/账本做手机写入、电脑读取往返；确认两端请求的服务主机名均为 `ledger-nas.985251.xyz`。

任何恢复都必须由用户明确确认具体快照和替换范围。恢复前后的数据库和失败状态均需保留，不得因账号不可见而重新注册覆盖。

## 分阶段上线及门槛

| 阶段 | 工作 | 完成条件 |
| --- | --- | --- |
| A. 安全入口 | 明确注册策略、主账号 MFA、检查 Cloudflare WAF/速率限制能力并验证 API 兼容性 | 安全设置有记录、手机/Web 登录与 API 无误伤 |
| B. 隧道入口 | 新增独立 `ledger-nas.985251.xyz → http://192.168.5.134:3001`，不改 SafeVault 或 OCI 当前入口 | HTTPS、应用健康和账号登录正常 |
| C. NAS 主站 | 更新 NAS `AUTH_PUBLIC_ORIGIN`、`NEO_ALLOWED_HOSTS`、`NEO_PRIMARY_ORIGIN`，保持原数据卷 | NAS 原账号和所有账本仍在；应用版本健康 |
| D. OCI 密文接收器 | 添加 token 校验、暂存/提交、SHA-256、14 份保留与 no-store 下载 | 错 token、超限、坏摘要、部分上传均失败关闭 |
| E. 自动备份 | NAS sidecar 启动后立即备份，此后每 24 小时上传；备份状态脱敏显示 | 连续至少 3 次成功，OCI 最新摘要与 NAS 发送摘要一致 |
| F. 恢复演练 | 下载 OCI 快照到隔离目录并解密校验；在隔离 NAS 数据目录/端口恢复 | 账号、账本、表关系和样本流水读回；不触碰主数据 |
| G. 客户端统一入口 | 原生客户端默认地址切到 NAS；电脑网页使用相同 HTTPS 地址 | 手机写入、电脑读取，反向读写同一记录；旧缓存仍按 origin 隔离 |

## 当前现场状态（2026-11-23 复核）

- 用户设定的是“NAS 唯一主数据、OCI 异地备份与恢复”。这里的“双向”仅指 NAS→OCI 备份和经确认后的 OCI→NAS 灾难恢复；不是两套数据库同时接受写入的实时双主复制。并行写入会造成不可安全自动合并的账本分叉。
- 邀请制已合并到主分支 `68bd51a`，并已部署到 OCI。OCI 已有账户状态未被替换。OCI 主站仍与 NAS 使用独立数据库。
- OCI `/api/nas-backup?status=1` 已用当前备份 Token 验证返回 HTTP 200，结果为 `latest: null`。此前 401 的根因是通用会话代理先于 Bearer Token 路由拦截；修复已合并并部署。当前 OCI 容器健康，备份接收器尚未收到任何 NAS 快照。
- NAS `neo-ledger-nas` 仍运行旧源码，持久化目录 `/SATA-1-4T/Docker/neo-ledger/data`、主机端口 `3001 → 容器 3000` 保持不变。NAS 邀请制尚未部署；本机与 NAS 私网地址当前不可直连。
- NAS 项目根目录 `/SATA-1-4T/Docker/neo-ledger` 已能看到独立 sidecar Compose 文件、NAS 加密备份环境文件和版本源码 ZIP；这些文件仅被上传，未解压、未启动 sidecar，也未改动现有主容器或 `data`。本机另已准备不覆盖现有源码/Compose 的最小 sidecar 源码归档及相对路径 Compose 文件，供安全解压和独立部署。
- NAS sidecar 尚未启动，OCI `latest` 仍为空；因此 NAS→OCI 自动备份及 OCI→NAS 隔离恢复演练均未完成。当前也没有任何平台已切换到 NAS，不能称为跨设备数据互通完成。
- Cloudflare `zspace-nas-985251` Tunnel 当前健康，仅有 1 条已发布路由：`nas.985251.xyz → http://192.168.5.134:18088`（SafeVault）。`985251.xyz` 为 Free 计划，目前速率限制规则 0/1；Free 规则不能按 Host 限定，先不增加可能连带影响现有服务的区域规则。新增 `ledger-nas.985251.xyz → http://192.168.5.134:3001` 会将 NAS 登录页和 API 公开到互联网。公开前使用应用自带的登录/注册限流、邀请码邮箱绑定、强唯一密码与 MFA；若后续要增加边缘规则，先确认可精确限定目标或验证不会误伤现有入口。未获得用户对该具体公网入口的行动确认前不改 Tunnel，也不切换客户端主站。
- 手机/桌面默认生产地址仍为 OCI。切至 NAS 前需先有可用 HTTPS 主机名、NAS 原账号登录和备份恢复演练；切换时不得清除旧服务缓存或自动搬动用户数据。

## 历史现场状态（2026-11-21）

- 已证实 Cloudflare Tunnel `zspace-nas-985251` 健康，现有唯一路由是 `nas.985251.xyz → http://192.168.5.134:18088`，该主机名目前显示 SafeVault。
- Cloudflare DNS 中 `ledger.985251.xyz` 仍指向 OCI `164.152.107.32`；必须保留。
- NAS Neo Ledger Docker 项目之前实测使用 `3001:3000`，持久数据目录为 `/SATA-1-4T/Docker/neo-ledger/data`。Cloudflare Tunnel 回源应使用 NAS 主机端口 `192.168.5.134:3001`；添加新路由前仍需健康探测确认。
- 仓库当时加入了 OCI 密文接收 API、NAS 只读 SQLite 加密 sidecar、状态查询与独立恢复候选生成；这些组件的当前部署状态以 2026-11-23 复核记录为准。
- 只有阶段 A–F 全部验收后，才能把原生客户端默认服务切到 NAS。期间 OCI 地址和 NAS 数据目录都保持不动。

## 永久安全规则

- NAS 是唯一写入主库；OCI 备份接收器永不向 NAS 推送、自动合并或自动覆盖业务数据。
- 每次 NAS 更新前验证停止态本地备份，确认 `/app/.wrangler` 原路径，再更新；更新后验证原账号和账本。
- 每次恢复前保留 NAS 当前数据、OCI 原密文和恢复候选；解密、摘要、SQLite 完整性或账号/账本检查任一失败即中止。
- 不在 Git、普通源码包、日志、浏览器 URL 或聊天中保存 bearer token、恢复口令和账单数据。
