# Neo Ledger 发布治理与 GA 证据闸门

发布工作流会先进入 GitHub `release-approval` 环境。环境必须配置至少两名审阅者（产品负责人、安全负责人或其代理），否则仅有 CI 绿灯不得创建公开 Release。

## 发布级别

| 级别 | 用途 | 必须证据 |
| --- | --- | --- |
| Developer Preview | 内部开发或自托管试用 | CI、依赖审计、SBOM、回滚说明 |
| Private Beta / RC | 邀请用户验证 | Preview 证据 + 真机核心路径、备份恢复演练、支持联系人 |
| GA | 对公众收费或承担托管责任 | RC 证据 + 外部渗透、容量/SLO、灾备 RPO/RTO、法务合规、计费客服演练 |

## `release-approval` 审阅步骤

1. 运行 `scripts/verify-release-version.mjs`，核对 tag、`package.json`、`app/app-version.ts` 与 `release-compatibility.json`；同时校验 Android 伴侣 `versionName`、最低 Web 兼容版本和 API 版本。Android 可独立发版，但不得出现未登记的版本漂移。
2. 核对本次构建的 SBOM、SHA-256、Sigstore keyless `.sig`/`.pem`、provenance attestation 和依赖审计结果；工作流必须先验证 SHA-256 与 CycloneDX 结构，再用 Cosign 验签，并由审阅人用 Cosign/官方 Rekor 记录复核签名主体与工作流身份。
3. 核对 [商业化路线图](/Users/peng/Desktop/neo-ledger/docs/COMMERCIALIZATION_ROADMAP.md) 中对应发布级别的外部证据，不得把仓库测试当作真机、渗透或法务证据。
4. GA/RC 发布前确认以下材料已归档到受控位置，并在发布工单记录链接和执行人：
   - `security-penetration-<version>.pdf`：P0/P1 均关闭，含复测日期。
   - `disaster-recovery-<version>.md`：备份恢复、跨版本升级、RPO/RTO 和回滚结果。
   - `device-matrix-<version>.md`：Chrome/Safari/Edge/Firefox、iOS Safari、Android Chrome、Passkey 与弱网场景。
   - `capacity-slo-<version>.md`：1 万/10 万/100 万流水、P95 写延迟、LCP、错误率和停止放量阈值。
   - `legal-approval-<version>.pdf`：隐私政策、服务条款、数据地图、DPIA/影响评估和删除流程审阅。
   - `billing-support-<version>.md`：试用、订阅、退款、取消、导出、客服升级和欠费只读策略演练。
   - `evidence-manifest-<version>.json`：版本号、审阅时间、至少两名不同审阅人、每份材料的 URI 来源、SHA-256、复核人和 `expiresAt`；来源必须带协议且可追溯，`reviewedAt` 不得在未来或早于发布前 365 天，复核人必须属于 manifest 审阅人列表，且材料未过期。
5. 任一材料缺失、manifest 版本或摘要不一致、存在未审阅的额外 artifact、复核人未列入、材料超过有效期或存在未关闭 P0/P1，审阅者必须拒绝批准并将版本保持在 Preview/RC。

## 不能由仓库测试替代的证据

- 正式域名、反向代理、OAuth、CSP、WebAuthn RP/Origin 和 DNS rebinding。
- 外部渗透、真实多租户权限、集中日志留存、告警和值班演练。
- Android/iOS 真机后台、重启、断网、键盘、通知和 Passkey 兼容性。
- 真实 D1/SQLite 数据分布、并发、锁等待、备份介质和灾备恢复。
- 计费、退款、客服、法务签字及个人信息删除请求闭环。

审阅批准只代表“证据已检查并允许发布该级别”，不代表产品获得金融、隐私或其他监管资质。
