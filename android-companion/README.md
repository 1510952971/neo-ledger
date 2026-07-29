# Neo Ledger Android 自动记账伴侣

这个伴侣应用使用 Android 的通知读取权限监听微信、支付宝及可选应用的支付通知，并把通知全文发送到 Neo Ledger 的 `/api/external/quick-sync`。Neo Ledger 负责解析金额、收支方向、商户、分类和重复事件。

## 安装与配置

1. 安装构建出的 `app-debug.apk` 或签名发布版 APK。
2. 在 Neo Ledger 的“数据中心 → 自动记账连接”生成密钥。
3. 密钥出现后点击“复制安卓配置”，把内容发送到自己的手机并复制。
4. 在伴侣应用点击“从 Neo Ledger 粘贴配置”；也可以手动填写局域网地址、密钥和账本 ID。
5. 点击“开启通知读取权限”，在系统页面允许“Neo Ledger 自动记账”。
6. 点击“发送 ¥0.01 测试账单”，确认主程序出现测试记录。

手机与运行 Neo Ledger 的电脑在同一 Wi-Fi 时可以使用局域网 HTTP 地址；离开局域网后，需要通过 HTTPS 域名或可信 VPN 访问。不同品牌手机可能还需要允许应用后台运行，并关闭针对该应用的省电限制。

小米/Redmi、华为/荣耀、OPPO/一加/realme、vivo/iQOO 和魅族会优先打开各自的自启动管理页；系统没有对应页面时自动回退到应用详情页。三星、Pixel 及其他接近原生 Android 的设备使用系统省电设置即可。

通知会先写入手机本地队列。临时断网、服务器重启或系统清理后台时不会立即丢失，恢复网络后会自动重试；主界面可以查看最近捕获内容、待发送数量和服务器返回状态。相同系统通知使用固定幂等 ID，重试不会重复入账。

## 平台能力

- Android 手机和平板：支持通过系统通知访问权限监听微信、支付宝及可选包名。
- iPhone/iPad：iOS 不允许第三方应用读取微信或支付宝通知，需要通过快捷指令、共享表单或手动确认发送到同一个 HTTP 接口。
- 桌面端与 NAS：作为 Neo Ledger 服务端接收通知；NAS 推荐用 Docker 部署并通过 HTTPS 或可信 VPN 提供外部访问。

## 构建

需要 JDK 17、Android SDK 35 和 Gradle 8.10.2：

```bash
gradle :app:testDebugUnitTest :app:assembleDebug
```

国内网络需要构建镜像时可临时设置 `NEO_ANDROID_MIRROR=aliyun`；默认仍使用 Google 和 Maven Central 官方仓库，镜像异常时不会影响 CI 发布。

APK 输出到 `app/build/outputs/apk/debug/app-debug.apk`。
