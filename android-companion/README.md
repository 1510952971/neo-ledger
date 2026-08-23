# Neo Ledger Android 自动记账伴侣

当前伴侣版本为 `1.1.3`，与 Web `1.1.x` 通过仓库根目录的 `release-compatibility.json` 绑定校验；两者不要求版本号相同，但发布时不得绕过该兼容性门禁。

这个伴侣应用支持两种 Android 自动记账模式：通知模式监听微信、支付宝及常见购物/外卖 App 的支付通知；付款完成界面模式通过 Android 无障碍服务读取当前前台支付 App 的可见界面。只有出现明确的支付完成结果和金额才会记账，并把紧凑的支付信息发送到 Neo Ledger 的版本化接口 `/api/v1/transactions`。它不会点击、输入或发起支付；账单列表、历史记录、订单详情、照片和支付前确认页都会被忽略。

## 安装与配置

1. 安装构建出的 `app-debug.apk` 或签名发布版 APK。
2. 电脑和手机连接同一个 Wi-Fi；在 Neo Ledger“数据中心 → 自动记账连接”点击“生成并复制安卓配置”。
3. 打开伴侣，点击“一键粘贴配置并开启通知权限”；配置会自动保存，剪贴板中的密钥随后清除。
4. 如果要识别付款完成界面，点击“开启无障碍支付识别”，在系统设置中启用“Neo Ledger 支付完成界面识别”，再返回伴侣确认状态为已开启。
5. 回到伴侣点击“发送 ¥0.01 测试账单”，确认主程序出现测试记录。测试账单只是连接测试，不代表真实支付。

伴侣首页的“应用更新”可以检查 GitHub 正式 Android Release。发现新版本后会下载并交给系统安装器；首次安装更新需要在系统设置中允许 Neo Ledger 安装未知应用。旧的未签名或另一把密钥构建的测试 APK 不能直接覆盖安装，正式版本必须保持 GitHub Actions 中的同一 Release keystore。

只有快速粘贴失败时才使用下面的手动地址、密钥和账本 ID 输入框。

手机与运行 Neo Ledger 的电脑在同一 Wi-Fi 时可以使用局域网 HTTP 地址；离开局域网后，需要通过 HTTPS 域名或可信 VPN 访问。不同品牌手机可能还需要允许应用后台运行，并关闭针对该应用的省电限制。

小米/Redmi、华为/荣耀、OPPO/一加/realme、vivo/iQOO 和魅族会优先打开各自的自启动管理页；系统没有对应页面时自动回退到应用详情页。三星、Pixel 及其他接近原生 Android 的设备使用系统省电设置即可。

通知会先写入手机本地队列。临时断网、服务器重启或系统清理后台时不会立即丢失，恢复网络后会自动重试；主界面可以查看最近捕获内容、待发送数量和服务器返回状态。相同系统通知使用固定幂等 ID，重试不会重复入账。

## 平台能力

- Android 手机和平板：支持系统通知监听，以及可选的无障碍支付完成界面识别；默认覆盖微信、支付宝、淘宝、京东、美团、拼多多、饿了么和云闪付，也可补充包名。
- iPhone/iPad：iOS 不允许第三方应用读取微信或支付宝通知，需要通过快捷指令、共享表单或手动确认发送到同一个 HTTP 接口。
- 桌面端与 NAS：作为 Neo Ledger 服务端接收通知；NAS 推荐用 Docker 部署并通过 HTTPS 或可信 VPN 提供外部访问。

## 构建

需要 JDK 17 和 Android SDK 35。仓库内 Wrapper 会下载并校验固定版本的 Gradle 8.10.2：

```bash
./gradlew --no-daemon testDebugUnitTest assembleDebug
```

国内网络需要构建镜像时可临时设置 `NEO_ANDROID_MIRROR=aliyun`；默认仍使用 Google 和 Maven Central 官方仓库，镜像异常时不会影响 CI 发布。

APK 输出到 `app/build/outputs/apk/debug/app-debug.apk`。

发布 Android 正式版时使用 `android-v` 标签，例如：

```bash
git tag android-v1.1.3
git push origin android-v1.1.3
```

GitHub Actions 会使用仓库 Secrets 中的固定签名密钥构建 Release APK，上传 APK 和 SHA-256 校验文件。伴侣 App 的“应用更新”只查找 `android-v*` 正式 Release。
