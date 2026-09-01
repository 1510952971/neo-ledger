# iOS / iPadOS TestFlight 发布准备

Neo Ledger 的 iOS/iPadOS Bundle ID 是 `online.eyeme.neoLedger`。主发布工作流只做 iOS 模拟器验证；真机安装和 TestFlight 上传由 `.github/workflows/ios-testflight.yml` 完成。

## GitHub Environment Secrets

在仓库的 `Settings → Environments` 中创建 `ios-distribution` Environment，并配置以下 Secrets。证书、Profile 和 App Store Connect 私钥不要提交到 Git 仓库：

- `IOS_DISTRIBUTION_CERTIFICATE_BASE64`：Apple Distribution `.p12` 文件的 base64。
- `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`：`.p12` 密码。
- `IOS_PROVISIONING_PROFILE_BASE64`：包含 `online.eyeme.neoLedger` 的 App Store provisioning profile 的 base64。
- `IOS_TEAM_ID`：Apple Developer Team ID。
- `APPSTORE_ISSUER_ID`：App Store Connect API Issuer ID。
- `APPSTORE_KEY_ID`：App Store Connect API Key ID。
- `APPSTORE_PRIVATE_KEY`：对应 `.p8` 文件的原始 PEM 内容。

证书和 Profile 可在 macOS 上转换为 base64：

```bash
base64 -i distribution.p12 | pbcopy
base64 -i NeoLedger_AppStore.mobileprovision | pbcopy
```

## 发布流程

1. 确认 `apps/native/pubspec.yaml` 版本和 Git 标签一致，例如 `1.2.3` / `native-v1.2.3`。
2. 确认 Bundle ID、Profile、证书和 Team ID 属于同一个 Apple Developer Team。
3. 在 GitHub Actions 手动运行 `iOS TestFlight distribution`，`source_ref` 填对应的 `native-v1.2.3` 标签。
4. 工作流会生成签名 IPA，保存 IPA 构建产物，并上传到 TestFlight。
5. 在 App Store Connect 完成 Beta 审核和测试员分发，再进行真机回归：登录、记账、导入、同步、更新和 iPad 横竖屏布局。

没有这些 Secrets 时，工作流会在第一步主动失败；这表示缺少 Apple 外部发行条件，不代表 iOS 已经完成。模拟器 ZIP 不能安装到 iPhone/iPad，也不能作为 TestFlight 版本。

## iOS 原生快捷指令入口

原生客户端已注册 `neoledger://entry` URL scheme。快捷指令可以用这个入口把付款金额、类型、商户、分类和带时区的时间预填到“记一笔”表单；用户必须在客户端核对并点击“保存”，该入口不会自动付款或跳过确认。

示例：

```text
neoledger://entry?amount=7.90&type=支出&title=午餐&category=餐饮&source=快捷指令&occurredAt=2026-09-01T12%3A30%3A00%2B08%3A00
```

真机验收至少覆盖：冷启动打开 URL、后台打开 URL、重复打开同一 URL、无效金额/时间、用户取消表单，以及保存后账本和离线队列状态。iOS 不提供读取微信、支付宝或其他 App 通知的权限，因此这个 URL 入口不等同于 Android 通知监听。
