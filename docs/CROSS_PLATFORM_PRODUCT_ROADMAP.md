# Neo Ledger 跨平台产品化与统一发布计划

> 目标：将当前完整 Web 账本产品，落地为 Windows、Android、iOS/iPadOS、Android 平板和 Web/NAS 多端一致的正式产品。所有客户端共享同一账本数据、同步协议、权限模型和发布版本，但遵守各操作系统允许的能力边界。

## 0. 先纠正当前状态

当前仓库不是“已经完成三端原生移植”的状态：

| 现有内容 | 实际定位 | 是否等于完整账本客户端 |
|---|---|---:|
| `app/` | 功能最完整的 Web/桌面浏览器端 | 否，仍依赖浏览器或 Web 容器 |
| `android-companion/` | Android 通知监听、无障碍支付识别、队列发送 | 否，只是自动记账伴侣 |
| `v1.1.0` Web Release | Web/NAS 发布产物 | 否，不是 Windows 安装包或移动端 App |
| `android-v1.1.14` | Android 伴侣 APK | 否，不包含完整账本页面功能 |

因此，之前发布的版本只能视为 Web 端和 Android 伴侣的中间发布，不能宣称已经完成“所有平台功能一致”。后续版本必须按本计划通过验收后再发布为正式跨平台版本。

## 1. 产品目标与验收口径

### 1.1 产品目标

Neo Ledger 最终由以下产品组成：

1. Web/NAS 端：自托管服务、浏览器访问和管理后台。
2. Windows 桌面端：独立安装、独立启动、无需用户手动打开浏览器。
3. Android 手机端：完整账本客户端，并内置通知监听和无障碍支付识别能力。
4. Android 平板端：完整账本客户端，横竖屏自适应；保留 Android 平台能力。
5. iPhone/iPad 端：完整账本客户端，采用 iOS 允许的快捷指令、分享扩展、剪贴板和导入方式完成自动化入口。

### 1.2 “功能一致”的准确含义

“功能一致”分成两层：

- **账本功能一致**：所有平台都能完成登录、账本切换、记账、编辑、删除、查询、导入、资产、预算、计划、统计、同步、备份、恢复和安全设置。
- **系统入口一致但实现不同**：Android 可以使用系统通知监听和无障碍服务；iOS 不提供对其他 App 通知或界面的通用读取权限，因此只能使用快捷指令、分享扩展、剪贴板、文件导入或服务商接口。不能为了表面一致而承诺 iOS 具备 Android 的系统级监听能力。

验收时将“平台限制”单独列为能力矩阵，不把不可获得的系统权限伪装成已完成。

## 2. 推荐总体架构

### 2.1 统一产品分层

```text
┌──────────────────────────────────────────────────────────────┐
│                       Neo Ledger 产品层                       │
├───────────────┬────────────────┬─────────────────────────────┤
│ Web/NAS        │ Native Client  │ Platform Adapters            │
│ Next.js/Web    │ Flutter        │ Android / iOS / Windows      │
│ 管理后台/PWA   │ 手机/平板/桌面  │ 通知/无障碍/快捷指令/更新      │
├───────────────┴────────────────┴─────────────────────────────┤
│ Shared Domain + API Contract + Sync Engine + Security Model   │
├──────────────────────────────────────────────────────────────┤
│ 现有服务端：账本、账户、同步、导入、AI、WebDAV、权限、审计      │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 客户端技术路线

推荐新增 Flutter 原生客户端，覆盖 Android、iOS/iPadOS、Windows；现有 Web 端继续作为 Web/NAS 客户端和迁移期基准。

选择理由：

- 一套 Dart 领域层和 UI 代码覆盖手机、平板、Windows。
- 响应式布局、键盘、触控笔、鼠标和窗口尺寸有统一模型。
- Android、iOS、Windows 的安装包和签名流程可以纳入同一套 CI 矩阵。
- Android 的通知监听、AccessibilityService、后台队列可以通过原生插件接入；iOS 的 Shortcuts/Share Extension 也可独立实现。

现有 TypeScript Web 页面不能直接“编译成原生 App”。页面功能、数据模型和 API 可以复用，但原生 UI、导航、离线数据库和系统能力必须重新实现。迁移期间 Web 端继续保留，直到原生客户端通过完整验收。

### 2.3 目录规划

```text
apps/
  web/                         # 现有 Web/NAS 客户端，迁移期保留
  native/                      # Flutter 完整客户端
    lib/
      core/                    # 主题、路由、权限、错误、更新
      domain/                  # 账本、流水、账户、资产、计划、统计
      data/                    # API、SQLite、同步队列、迁移
      features/                # 各业务模块
      platform/                # 平台适配入口
    android/                   # 通知监听、无障碍、后台任务
    ios/                       # Shortcuts、Share Extension、通知
    windows/                   # Windows 安装、托盘、更新
packages/
  api-contract/               # OpenAPI/JSON Schema/生成客户端
  domain-model/                # 统一字段、枚举、校验和版本
  sync-protocol/               # 游标、冲突、幂等、离线队列
android-companion/             # 迁移完成前保留；完成后转为兼容升级路径
.github/workflows/
  web-release.yml
  native-matrix-release.yml
  android-release.yml
  ios-testflight.yml
  windows-release.yml
```

实际落地时可以先在现有仓库新增 `apps/native`，不要求一次性重命名当前 Web 目录，避免破坏现有部署。

## 3. 功能完整移植矩阵

以下功能必须在 Web、Windows、Android 手机、Android 平板、iPhone、iPad 逐项打勾后，才允许称为“完整移植”：

| 功能域 | 必须移植的能力 | 统一验收标准 |
|---|---|---|
| 身份与账本 | 登录、登出、设备管理、账本切换、权限、会话过期 | 任意端登录后可访问同一账本，权限一致 |
| 首页 | 日报、收支卡片、结余、最近流水、提醒、同步状态 | 数据与 Web 端一致，实时变更可见 |
| 快速记账 | 支出、收入、转账、分类、账户、商户、备注、日期、附件 | 手机单手完成；桌面支持快捷键；数据可撤销 |
| 流水 | 搜索、筛选、分组、详情、编辑、删除、批量操作、撤销 | 删除即时移除，失败可恢复，不能重复写入 |
| 导入 | 微信、支付宝、银行 CSV/Excel、图片/OCR、批量校验 | 导入预览、重复检测、错误行可重试 |
| 账户与资产 | 现金、银行卡、支付账户、负债、投资/数字资产、余额 | 余额、流水和转账守恒 |
| 预算与计划 | 预算、超支、固定支出、订阅、分期、存钱罐、FIRE | 计算结果和周期跨端一致 |
| 分账结算 | 多人分账、借贷、应收应付、结算状态 | 幂等、金额无损、状态可追踪 |
| 统计分析 | 日/周/月/年、自定义区间、分类、趋势、资产分析 | 图表口径与服务端同源 |
| AI Copilot | 查询、摘要、建议、权限提示、失败降级 | 不越权、不把建议当作写入 |
| 数据中心 | 备份、恢复、WebDAV、NAS、P2P/局域网、导出 | 能看到进度、结果、错误和恢复点 |
| 安全 | Passkey/生物识别、屏幕锁、防窥、敏感数据脱敏 | 设备丢失时本地密钥不可直接导出 |
| 自动记账 | 通知、无障碍、支付完成判定、来源白名单、队列 | 只处理真实支付完成事件，拒绝历史/截图/普通订单页 |
| 更新 | 检查版本、变更说明、下载/跳转、校验、失败恢复 | 不同平台使用正确的系统安装渠道 |

## 4. 三类 UI 设计规范

### 4.1 移动端：320–640 px

- 顶部沉浸式安全区：账本切换、同步状态、未读提醒、头像。
- 底部 5 Tab：主页、资产、账单、规划、分析。
- 中央凸起“记一笔”FAB，显示离线待同步数量。
- 记账使用 Bottom Sheet：拖拽把手、今天/昨天/前天 Chips、大金额输入、分类横滑。
- 流水支持左滑编辑/删除、右滑复制/忽略；删除后提供短时撤销。
- 所有关键状态必须有可读文字，不只依赖颜色或红点。

### 4.2 平板端：641–1180 px

- 横屏：68 px Navigation Rail + 主列表 + 详情 Master–Detail。
- 竖屏：两列卡片/列表，自适应降级为移动端抽屉。
- 支持鼠标、外接键盘、触控笔、分屏和窗口尺寸变化。
- 详情区用于展示流水、账户、图表和同步诊断，减少重复打开弹窗。

### 4.3 Windows：≥1181 px

- 224 px 侧栏，可折叠为 64 px。
- 首页采用多列高密度仪表盘。
- 流水支持宽表、多选、批量分类、批量对账和快捷键。
- 支持窗口缩放、系统托盘、全局/应用内快捷键、导入文件拖放。
- 不依赖 Chrome/Edge 标签页才能运行；安装后从开始菜单直接启动。

### 4.4 视觉与交互基准

在实现前进行一次竞品基准评审，参考成熟记账产品的共性模式：

- 首页先展示现金流和待处理事项，而不是装饰性卡片。
- 流水默认按日期分组，搜索、筛选、分类和撤销操作始终可见。
- 账户、预算和流水使用同一套金额口径。
- 离线、同步中、冲突、待发送、失败等状态明确显示数量和动作。
- 复杂设置进入数据中心/设置页，不挤占快速记账主流程。

参考成熟产品的交互模式，不复制其品牌、文案或视觉资产；最终以本仓库的领域模型和隐私要求为准。

## 5. 自动记账和系统能力边界

### 5.1 Android

完整客户端内置现有伴侣能力，不再把它作为一个“只有伴侣页面”的独立产品：

1. NotificationListenerService 监听允许的通知来源。
2. AccessibilityService 只观察用户当前前台 App 的 UI 事件和可访问节点。
3. 通过来源包名白名单识别微信、支付宝、抖音、淘宝、京东、美团、拼多多、小红书、闲鱼等平台。
4. 支付判定必须同时满足：当前前台来源、支付成功语义、明确金额、有效时间窗口、非历史/订单/截图/推荐页。
5. 订单成功页只能作为辅助证据，不能单独当作支付完成；支付完成界面短暂出现时，要在窗口内容变化事件和文本快照中及时取证。
6. 事件写入本地加密队列，使用稳定幂等键；网络恢复后自动同步，界面显示“识别、入队、已入账、重复、失败”数量。
7. 不允许无障碍服务自动点击支付、代替用户付款或绕过支付确认。

Android 官方文档说明，通知监听服务接收通知发布/移除等回调；无障碍服务需要用户在系统设置中显式开启，并可按包名和事件类型配置。它们不是“读取所有页面后保证识别”的万能接口，因此必须保留误判诊断和人工补录入口。[Android NotificationListenerService](https://developer.android.com/reference/android/service/notification/NotificationListenerService) · [Android AccessibilityService](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService)

### 5.2 iOS/iPadOS

iOS/iPadOS 客户端完整移植所有账本能力，但自动记账入口按系统允许方式实现：

- Shortcuts 自动化：用户授权后接收快捷指令传入的金额、商户、来源和时间。
- Share Extension：从支付结果、订单详情或账单页面分享给 Neo Ledger。
- 剪贴板/文件导入：用户主动确认后解析。
- 银行/支付服务商公开接口：仅在合法、稳定且用户授权的情况下接入。
- 本地通知只用于提示 Neo Ledger 自己的同步/待处理状态，不能把它当作读取其他 App 通知的能力。

不能承诺 iOS/iPadOS 像 Android 一样后台读取微信、支付宝、抖音等其他 App 的通知或界面。Apple 的正式发布和测试链路是 App Store Connect、TestFlight 和 App Store；GitHub 可以保存源码、构建记录、更新说明和校验信息，但不能替代 iOS 的签名与分发渠道。[Apple App Store Connect workflow](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-workflow) · [Apple TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/) · [Apple distribution](https://developer.apple.com/documentation/technologyoverviews/distribution)

### 5.3 Windows

- 完整账本能力全部原生可用。
- Windows 端不负责读取手机上的支付页面；手机端识别后通过同步协议推送到账本。
- 如需 Windows 系统通知入口，只做 Neo Ledger 自身通知和待处理提醒，不把它当作手机支付监听替代品。

## 6. 统一数据、离线和同步方案

### 6.1 服务端

- 将现有 API 固化为版本化 `/api/v1` 合约。
- 用 OpenAPI/JSON Schema 生成客户端模型和请求层。
- 所有写入接口支持 `idempotencyKey`、`clientId`、`deviceId`、`clientMutationId`。
- 所有账本数据带 `revision`/`updatedAt`/`deletedAt`，删除使用墓碑记录，避免多端重新出现。
- 提供同步游标：客户端按账本和设备拉取增量，而不是每次全量刷新。
- 推送优先使用 SSE/WebSocket；不可用时降级为带退避的轮询。

### 6.2 原生客户端

- SQLite 保存账本快照、未发送队列、同步游标、冲突记录和迁移版本。
- 断网可记账，联网后静默同步；同步状态可见但不阻塞用户记账。
- 乐观删除立即从列表移除，显示撤销条；服务端失败才回滚并说明原因。
- 冲突不静默覆盖：显示冲突字段、设备、时间和“保留本地/保留服务器/合并”操作。
- 任何自动识别事件先入本地队列，成功入账后才从待发送数中扣除。

### 6.3 三端互通验收

必须验证以下场景：

1. 手机离线记一笔，恢复网络后 Windows 和 Web 自动出现。
2. Windows 编辑，平板正在查看时无刷新手势也能看到变更。
3. 两台设备同时编辑同一流水，产生可解释冲突而不是重复账单。
4. 删除后所有客户端同步消失，并可在短时间内撤销。
5. 自动识别 3 笔付款时，识别数、入队数、已入账数、重复数、失败数逐项一致。

## 7. GitHub 统一发布和更新流程

### 7.1 单一版本清单

新增 `release-manifest.json`，每次产品发布由服务端和客户端共同读取：

```json
{
  "productVersion": "1.2.0",
  "apiVersion": "v1",
  "minimumServerVersion": "1.2.0",
  "minimumClientVersion": "1.2.0",
  "channels": {
    "stable": {
      "windows": {"artifact": "...", "sha256": "..."},
      "android": {"artifact": "...", "sha256": "..."},
      "ios": {"storeUrl": "...", "testFlightUrl": "..."},
      "web": {"artifact": "..."}
    }
  }
}
```

客户端不再各自猜测 GitHub tag，也不再用 Web 版本去比较 Android 版本。比较规则为：产品版本 + 平台构建号 + 最低兼容 API 版本。

### 7.2 GitHub Actions 矩阵

发布 `v1.2.0` 时按以下顺序运行：

1. `validate`：类型检查、Lint、单元测试、API 合约测试、数据库迁移测试。
2. `web`：构建 Web/NAS 产物、Docker 镜像、校验和、SBOM。
3. `android`：构建 signed APK/AAB，发布 APK 校验和；保留 Play 发布入口。
4. `ios`：使用 Apple Developer/ App Store Connect 凭据构建并上传 TestFlight；GitHub Release 只记录构建信息和商店链接。
5. `windows`：构建签名 MSIX/安装包，生成校验和、SBOM 和更新元数据。
6. `manifest`：汇总所有成功产物，发布统一 Release Notes 和 `release-manifest.json`。
7. `smoke`：安装/启动/登录/同步/升级/回滚冒烟测试。
8. `promote`：人工批准后将候选版本提升为 stable；失败则保留上一稳定版本。

### 7.3 分发规则

| 平台 | GitHub 的作用 | 用户实际安装/更新方式 |
|---|---|---|
| Web/NAS | Release、Docker 镜像、迁移说明 | NAS 更新镜像或下载部署包 |
| Windows | 保存 MSIX/安装包、校验和、更新日志 | 应用内检查后下载并安装签名包 |
| Android | 保存 APK/AAB、校验和、更新日志 | 应用内检查；APK 需用户允许安装来源，或走应用商店 |
| iOS/iPadOS | 保存源码、构建记录、版本说明、商店链接 | TestFlight/App Store 更新，不能由 GitHub APK 式直装 |

### 7.4 签名和回滚

- Android 使用固定 release keystore，绝不能每次生成新签名。
- Windows 使用代码签名证书，优先 MSIX；签名证书进入 GitHub Secrets。
- iOS 使用 App Store Connect API Key、证书和 provisioning profile，全部进入 Secrets，不提交仓库。
- 所有产物生成 SHA-256、SBOM 和构建来源证明。
- 客户端安装前校验产品版本、平台、签名和哈希。
- 服务端先备份数据库，再做迁移；健康检查失败自动停止升级并保留回滚点。
- 客户端更新失败可继续启动上一版本，不清除本地队列和密钥。

### 7.5 当前发布流程必须修正的问题

- 将 Web tag、完整客户端 tag 和 Android 伴侣兼容 tag 分离，避免现有辅助工作流把 `android-v...` 错当成 Web 版本。
- 统一由产品版本清单驱动，不再让 Android updater 只筛选 `android-v*` Release。
- 在正式发布前检查“Windows/iOS/Android/平板产物是否齐全”，缺少任何必需平台时只能发布为 `preview`，不能标记为 stable。
- Release Notes 必须明确本版本是“完整客户端”“伴侣兼容版”还是“Web/NAS 服务版”。

## 8. 分阶段实施计划

### Phase 0：基线审计与竞品评审

交付物：

- 当前 Web 功能清单和路由/组件映射。
- API、数据库、权限、导入和同步接口清单。
- 本文功能矩阵转为可勾选验收表。
- 手机、平板、Windows 的线框和交互基准。
- Android/iOS/Windows 能力边界清单。

完成门槛：所有现有功能都有“保留、重构、废弃、待确认”结论。

### Phase 1：统一领域层和 API 合约

交付物：

- `packages/api-contract`。
- 账本、流水、账户、资产、预算、导入、同步、自动识别事件的统一模型。
- 幂等、游标、墓碑删除、冲突和离线队列协议。
- 服务端兼容测试和迁移脚本。

完成门槛：Web 端和新客户端都能通过同一套 API 合约测试。

### Phase 2：原生客户端骨架

交付物：

- `apps/native` Flutter 工程。
- 登录、账本切换、主题、路由、SQLite、加密存储、版本检查。
- 移动端、平板端、Windows 三套响应式壳层。
- 最小可用同步：拉取、写入、离线队列、重试。

完成门槛：三类设备都能安装、启动、登录、离线记一笔并同步到 Web。

### Phase 3：核心账本功能移植

按垂直链路完成，而不是先堆空页面：

1. 首页 + 快速记账 + 流水详情。
2. 编辑/删除/撤销 + 搜索/筛选/批量处理。
3. 账户/资产 + 转账 + 余额守恒。
4. 微信/支付宝/银行账单导入 + 预览/重复/错误修复。

完成门槛：核心账本功能在 Windows、Android、iOS、平板均可真实操作，数据与 Web 一致。

### Phase 4：高级业务模块

迁移预算、计划、固定支出、订阅、分期、存钱罐、分账借贷、统计分析、FIRE、成就、AI、数据中心、WebDAV、备份恢复和隐私锁。

完成门槛：每个模块有真实读写链路、错误态、空态、加载态、离线态和权限态，不接受只有展示 UI 的“占位功能”。

### Phase 5：平台能力

- Android：将现有 companion 能力并入完整客户端；通知、无障碍、后台队列、厂商自启动指引、支付完成判定诊断。
- iOS/iPadOS：Shortcuts、Share Extension、文件/剪贴板导入、通知和后台同步。
- Windows：安装包、托盘、快捷键、拖放导入、桌面更新和数据目录管理。

完成门槛：平台能力显示真实状态和最近事件；未获系统能力时给出可执行指引，不显示虚假的“已开启”。

### Phase 6：质量、隐私和发布

- 真机矩阵测试：Android 手机/平板、iPhone/iPad、Windows 10/11、不同屏幕和方向。
- 断网、弱网、杀进程、锁屏、升级中断、时区、重复事件、服务端回滚测试。
- 无障碍、键盘、触控笔、安全审计、敏感日志审计。
- GitHub Actions 多平台构建、签名、产物校验、TestFlight、Windows/Android 发布。

完成门槛：所有 P0/P1 缺陷关闭；功能矩阵、数据一致性和升级回滚测试全部通过。

### Phase 7：稳定发布

发布通道：`dev` → `preview` → `beta` → `stable`。

每个通道都必须记录：版本、数据库迁移、最低客户端、最低服务器、已知限制、下载/商店链接、回滚版本和测试结果。

## 9. 质量门禁

正式 stable 发布必须同时满足：

- Web、Windows、Android、iOS/iPadOS 的核心账本功能矩阵 100% 通过。
- 所有写入操作幂等；同一支付事件重复到达不能产生重复流水。
- 自动识别状态至少展示：识别数、入队数、待发送数、已入账数、重复数、失败数。
- 删除是即时 UI 移除 + 可撤销，不依赖用户手动刷新。
- 断网可记，恢复联网可同步；同步失败可重试且不丢本地队列。
- GitHub 发布缺少必需平台产物时不能进入 stable。
- 每个平台的安装和升级方式符合该平台的签名/分发规则。
- 文档明确 Android 与 iOS 自动识别能力差异，不作无法兑现的权限承诺。

## 10. 立即执行顺序

本仓库下一步按以下顺序实施：

1. 暂停把现有 `android-companion` APK 当作完整移动端发布。
2. 新增 `apps/native` Flutter 工程和统一 API 合约骨架。
3. 把 Web 端现有首页、账本列表、流水详情、快速记账和同步接口做成第一条原生垂直链路。
4. 先交付 Android 手机 + Windows 的核心账本 Alpha，再补平板布局和 iOS 适配入口。
5. 核心账本稳定后，再迁移预算/资产/导入/分析/AI 等高级模块。
6. 最后合并 Android 自动识别、iOS 快捷指令和 GitHub 多平台发布；通过质量门禁后才发布新的 stable 版本。

这份计划书是实现基线。后续任何版本说明都必须以实际构建产物和验收矩阵为准，不能再用“代码已推送”代替“客户端已完成并可安装使用”。
