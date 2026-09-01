# Neo Ledger 发布与更新流程

本文档是当前仓库的真实发布边界。它把“代码已通过构建”“产物可安装”和“产物已正式分发”分开，避免把本地测试包误当成正式版本。

## 版本和触发规则

- 原生客户端版本唯一来源：`apps/native/pubspec.yaml` 的 `version`。
- 原生多端发布标签格式：`native-vX.Y.Z`，且必须与 `pubspec.yaml` 中的 `X.Y.Z` 完全一致。
- `main` 分支和 Pull Request 会执行 Flutter 分析、测试、Web 构建；推送 `native-v*` 标签才会进入 Android、Windows、iOS 和 GitHub Release 流程。
- Web 站点仍由根目录现有的 Web 发布工作流负责，不要用普通 `v*` 标签代替 `native-v*`。

## GitHub Actions 产物

`.github/workflows/native-release.yml` 会生成：

| 平台 | 当前产物 | 当前状态 |
| --- | --- | --- |
| Android | `neo-ledger-android-X.Y.Z.apk`、`.aab` | 标签发布必须使用正式签名；普通分支构建仅用于 CI 验证 |
| Windows | `neo-ledger-windows-X.Y.Z-setup.exe`、`.zip` | Inno Setup 安装器和便携包；签名状态写入 `RELEASE_STATUS.json`，生产分发应配置代码签名 |
| iOS/iPadOS | Apple 签名后的 TestFlight/App Store 版本 | `ios-testflight.yml` 负责签名、IPA 构建和 TestFlight 上传；主发布工作流的模拟器包不进入稳定 Release |
| Web/NAS | `neo-ledger-web-X.Y.Z.tar.gz` | 可部署的 Flutter Web 静态文件 |

### Android 签名

推送 `native-v*` 标签前，GitHub 仓库必须配置以下 Actions Secrets。工作流兼容两套名称；推荐使用带 `NEO_LEDGER_` 前缀的一套，新仓库也可以沿用现有 Android companion 的无前缀名称：

- `NEO_LEDGER_ANDROID_KEYSTORE_BASE64` 或 `ANDROID_KEYSTORE_BASE64`
- `NEO_LEDGER_ANDROID_KEYSTORE_PASSWORD` 或 `ANDROID_KEYSTORE_PASSWORD`
- `NEO_LEDGER_ANDROID_KEY_ALIAS` 或 `ANDROID_KEY_ALIAS`
- `NEO_LEDGER_ANDROID_KEY_PASSWORD` 或 `ANDROID_KEY_PASSWORD`

带标签的正式构建如果缺少任一密钥会主动失败，不会回退到 debug 签名。开发者本地如需验证构建，可显式传入 `-PneoLedgerAllowDebugSigning=true`；这类 APK 不能作为升级基线或正式分发包。

## 发布命令

确认测试、版本号和变更记录后，在仓库根目录执行：

```bash
git add apps/native .github/workflows/native-release.yml release-manifest.json docs/RELEASE_AND_UPDATE.md
git commit -m "release: native v1.2.7"
git push origin main
git tag native-v1.2.7
git push origin native-v1.2.7
```

标签推送后，在 GitHub Actions 中确认 `Native client build and release` 的四个平台构建均成功，再检查稳定 Release 是否包含 APK、AAB、Windows 安装器、Windows ZIP、Web 压缩包、`RELEASE_STATUS.json` 和 `SHA256SUMS.txt`。发布 job 会拒绝缺失任一安装资产的构建，并在发布前校验 Windows 安装器签名状态；未签名 iOS 模拟器包不会进入稳定 Release。Windows 没有签名凭据时仍可生成可安装测试包，但必须在 `RELEASE_STATUS.json` 中明确标记 `installerSigned: false`；生产分发应配置证书。发布 job 会进入 `release-approval` 环境；仓库管理员仍需在 GitHub 项目设置中为该环境配置至少两名 Required reviewers。iOS 真机版本需在 `iOS TestFlight distribution` 中使用 Apple 凭据单独构建和上传。

## 客户端更新语义

原生客户端只查询 GitHub Releases API 中“非草稿、非预发布、标签为 `native-v*`”的版本，并按语义版本比较。它不会把 Web 发布或 Android companion 的标签误当成原生客户端更新。

当前更新流程是：检查版本 → 展示版本和更新说明 → 用户确认。Android 会优先选择规范命名的 APK，在应用内下载、校验 SHA-256，并交给系统安装器；首次安装仍需要用户允许“安装未知应用”，且系统始终会显示安装确认。iOS 必须通过 TestFlight/App Store；Windows 客户端会下载并启动规范命名、且通过校验清单校验的 EXE 安装器，安装器不可用时才打开发布页，且安装器路径仅允许位于系统临时目录。Windows 是否签名以 Release 的 `RELEASE_STATUS.json` 为准；未签名 EXE 可能触发 SmartScreen 警告。

## 三端正式验收清单

在对外宣称版本完成前，必须逐项留存证据：

1. Android：正式签名 APK 能安装，覆盖升级安装成功；通知监听、无障碍支付识别、离线队列和重新联网同步通过真实设备测试。
2. Windows：安装器和便携包均能启动，覆盖升级安装与卸载；构建必须校验签名状态并写入 Release 状态文件，生产分发版本应使用代码签名。
3. iOS/iPadOS：使用 Apple Developer 签名完成真机安装，通过 TestFlight 验收；模拟器 ZIP 不能算 iOS 交付。
4. Web/NAS：静态包部署后，手机、平板、Windows 浏览器通过同一服务端账本互通，包含冲突处理、删除同步和离线恢复。
5. 更新：旧版本检查到新 `native-v*`，展示正确版本；Android 确认后验证并交给系统安装器，其他平台打开对应发布入口；升级后登录、账本和本地密钥仍保留。

## 当前明确未完成的外部条件

- Apple Developer 证书、Provisioning Profile 和 TestFlight/App Store 发布凭据不应提交到仓库，需配置在 `ios-distribution` Environment Secrets。
- Windows 安装器构建已纳入 CI；当前 `native-v1.2.10` 的 EXE 未签名但已明确标记，生产分发仍需配置 Windows 代码签名证书和密码。
- GitHub 正式标签发布是否成功取决于仓库 Secrets 和 Actions 实际运行结果。
- 本地原生客户端的完整跨平台自动化能力仍需在真实 Android、iOS/iPadOS、Windows 设备上验收；Web/API 层通过不等于系统级能力已经交付。
