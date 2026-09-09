# Neo Ledger 安装包与版本管理

GitHub Releases 是安装包的唯一正式来源。每个稳定版本使用
`native-v<版本号>` 标签，所有平台产物、校验文件和发布状态放在同一个版本下，
避免网页、桌面端和移动端混用不同代码。

## 当前统一版本

- 客户端版本：`1.3.0`
- 统一网页与数据服务：`https://neo-ledger-production.neo-ledger.workers.dev`
- 发布页：`https://github.com/1510952971/neo-ledger/releases/tag/native-v1.3.0`

## 产物命名

| 平台 | 安装或分发文件 |
| --- | --- |
| Android | `neo-ledger-android-1.3.0.apk`、`neo-ledger-android-1.3.0.aab` |
| Windows | `neo-ledger-windows-1.3.0-setup.exe`、便携 ZIP |
| macOS | `neo-ledger-macos-1.3.0.dmg`、应用 ZIP |
| iOS | 未签名验证包；正式安装通过 TestFlight / App Store |
| Web / NAS | `neo-ledger-web-1.3.0.tar.gz` |

每个 Release 同时提供 `SHA256SUMS.txt` 和 `RELEASE_STATUS.json`。前者验证
下载完整性，后者记录各平台签名状态。Android 稳定包必须使用正式密钥签名；
Windows 与 macOS 在未配置代码签名证书时会明确标记为未签名测试包。

## 发布规则

1. 修改 `apps/native/pubspec.yaml`、`release-manifest.json` 和
   `release-compatibility.json`，三个版本必须一致。
2. 先推送主分支并等待全部平台构建、测试及公网健康检查通过。
3. 再创建并推送对应的 `native-v<版本号>` 标签。
4. 发布流程自动生成所有平台产物、校验和及状态文件；客户端只检查
   `native-v*` 稳定版本，不把预览包误报为最新版。
5. 不覆盖旧版本 Release。出现问题时发布递增的新版本，以便审计和回退。

安装版使用和线上网页相同的前端与同一个服务端。用户在所有设备登录同一账号
后，账单、资产、规划与设置由服务器统一保存；安装包本身不复制或维护另一份
业务数据库。
