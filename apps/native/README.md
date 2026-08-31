# Neo Ledger 原生统一客户端

这里是 Windows、Android、iOS/iPadOS、平板和 Web/PWA 共用的 Flutter 客户端工程。它与 `android-companion/` 不同：伴侣应用只负责 Android 通知/无障碍采集，本工程负责完整的登录、账本、资产、流水和记账界面。原生客户端不是一个只展示网页的壳，所有业务操作都通过统一 API 和本地离线队列完成。

## 本地运行

```bash
flutter pub get
flutter analyze
flutter test
flutter run -d chrome
flutter run -d windows
flutter run -d android
```

Android 和 Web 当前已在 GitHub Actions 完成 release 流程验证；本地 Android 包必须显式启用 debug 签名参数，因此仅是测试包。iOS 需要完整 Xcode 与 Apple 签名；Windows 构建需要 Windows runner。两者由 `.github/workflows/native-release.yml` 在 GitHub Actions 上构建。

## 发布与更新

原生客户端使用独立标签：

```bash
git tag native-v1.2.4
git push origin native-v1.2.4
```

工作流会构建 Android APK/AAB、Windows 安装器和便携 ZIP、iOS 未签名归档和 Web 归档，并上传到 GitHub Release。客户端内的“检查更新”只读取 `native-v*` Release，不会把 Web 或 Android 伴侣版本误认为原生客户端版本。iOS 真机分发由 `.github/workflows/ios-testflight.yml` 单独负责。

## 当前迁移范围

已落地：登录、账本和账户增删改、首页收入/支出/结余、账户资产、流水列表、记一笔、预算、固定订阅、分期、存钱目标、数字资产、响应式移动/平板/桌面导航、离线队列落盘与同步、数据中心备份/恢复预检、分类管理、偏好设置、AI 请求入口、WebDAV/NAS 操作入口、JSON/CSV 账单文件导入、分账结算、统计/预测、FIRE 参数和 GitHub 原生版本检查。原生端导入支持文件选择或粘贴；Web 端仍支持 Excel、PDF、图片等更丰富的文件识别流程。

仍需平台级交付或真实设备验收的能力：Android 通知/无障碍采集已并入主 APK，但仍需真实设备回归；iOS 快捷指令/分享入口、Passkey/本地生物识别锁、原生 WebRTC P2P 直连、银行/OCR 导入的真实设备体验，以及 Apple/Windows 正式签名分发。当前这些边界会在界面和发布文档中明确标注，不把服务端 API 或未签名归档伪装成已完成的平台能力。

## 版本更新规则

原生客户端只识别正式 GitHub Release 中的 `native-v*` 标签。例如 `native-v1.2.4` 才会被 Android、Windows、iOS/iPadOS 和桌面端的检查更新识别；普通 `v*` 是 Web 发布，`android-v*` 是 Android 伴侣发布。Android 和 Windows 标签构建必须提供正式签名参数；本地调试 APK 或未签名 Windows 包只能用于测试。iOS 真机安装必须通过 Apple 签名和 TestFlight/App Store，不能用模拟器归档代替。
