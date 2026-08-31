import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const nativeAndroid = resolve(root, 'apps/native/android/app/src/main');
const nativeFlutter = readFileSync(resolve(root, 'apps/native/lib/app.dart'), 'utf8');
const nativeManifest = readFileSync(resolve(nativeAndroid, 'AndroidManifest.xml'), 'utf8');
const nativeGradle = readFileSync(resolve(root, 'apps/native/android/app/build.gradle.kts'), 'utf8');
const nativeActivity = readFileSync(
  resolve(root, 'apps/native/android/app/src/main/kotlin/online/eyeme/neo_ledger/MainActivity.kt'),
  'utf8',
);
const nativeBridge = readFileSync(
  resolve(nativeAndroid, 'java/online/eyeme/neoledger/companion/NeoCompanionBridge.java'),
  'utf8',
);
const legacyCatalog = readFileSync(
  resolve(root, 'android-companion/app/src/main/java/online/eyeme/neoledger/companion/PaymentAppCatalog.java'),
  'utf8',
);

const checks = [
  [
    'native APK compiles the shared companion source tree',
    nativeGradle.includes('java.srcDirs("../../../../android-companion/app/src/main/java")'),
  ],
  ['native manifest disables backup for notification/payment data', nativeManifest.includes('android:allowBackup="false"')],
  ['native manifest keeps the companion network security policy', nativeManifest.includes('android:networkSecurityConfig="@xml/network_security_config"')],
  ['native manifest exposes the notification listener service', nativeManifest.includes('android.service.notification.NotificationListenerService')],
  ['native manifest exposes the payment accessibility service', nativeManifest.includes('android.accessibilityservice.AccessibilityService')],
  ['notification listener keeps its user-facing label', nativeManifest.includes('Neo Ledger 支付通知监听')],
  ['accessibility service keeps its user-facing label', nativeManifest.includes('Neo Ledger 支付完成界面识别')],
  ['payment accessibility configuration is packaged', existsSync(resolve(nativeAndroid, 'res/xml/payment_accessibility_service.xml'))],
  ['network security configuration is packaged', existsSync(resolve(nativeAndroid, 'res/xml/network_security_config.xml'))],
  ['Flutter bridge exposes companion configuration', nativeBridge.includes('static void configure(')],
  ['Flutter bridge exposes companion status', nativeBridge.includes('static Map<String, Object> status(')],
  ['Flutter bridge exposes pending delivery', nativeBridge.includes('static void flushPending(')],
  ['Flutter bridge exposes test delivery', nativeBridge.includes('static void sendTest(')],
  ['Flutter exposes the merged Android companion section', nativeFlutter.includes("'Android 伴侣'")],
  ['Flutter keeps the old Android companion entry point', nativeFlutter.includes("'Android 自动记账'")],
  ['Flutter exposes one-tap configuration and notification setup', nativeFlutter.includes("'一键粘贴配置并开启通知权限'")],
  ['Flutter exposes notification permission controls', nativeFlutter.includes("'通知使用权'")],
  ['Flutter exposes accessibility permission controls', nativeFlutter.includes("'无障碍服务'")],
  ['Flutter exposes vendor background controls', nativeFlutter.includes("'厂商自启动 / 后台设置'")],
  ['Flutter exposes battery controls', nativeFlutter.includes("'系统省电设置'")],
  ['Flutter exposes test-bill delivery', nativeFlutter.includes("'发送 ¥0.01 测试账单'")],
  ['Flutter exposes pending-bill delivery', nativeFlutter.includes("'立即发送待处理账单")],
  ['Flutter displays pending count and capture diagnostics', nativeFlutter.includes("label: '待发送'") && nativeFlutter.includes("'最近捕获：") && nativeFlutter.includes("'诊断：")],
  ['native activity opens notification settings', nativeActivity.includes('"openNotificationSettings"')],
  ['native activity opens accessibility settings', nativeActivity.includes('"openAccessibilitySettings"')],
  ['native activity opens vendor startup settings', nativeActivity.includes('"openAutostartSettings"')],
  ['native activity opens battery settings', nativeActivity.includes('"openBatterySettings"')],
  ['native activity installs APK updates', nativeActivity.includes('"installUpdate"')],
  ['native manifest requests APK installation permission', nativeManifest.includes('android.permission.REQUEST_INSTALL_PACKAGES')],
  ['native manifest packages the APK provider', nativeManifest.includes('NeoApkFileProvider')],
  ['native manifest restarts companion work after boot and update', nativeManifest.includes('android.intent.action.BOOT_COMPLETED') && nativeManifest.includes('android.intent.action.MY_PACKAGE_REPLACED')],
  ['legacy catalog keeps Taobao and JD', legacyCatalog.includes('com.taobao.taobao') && legacyCatalog.includes('com.jingdong.app.mall')],
  ['legacy catalog keeps Meituan, Pinduoduo and Eleme', legacyCatalog.includes('com.sankuai.meituan') && legacyCatalog.includes('com.xunmeng.pinduoduo') && legacyCatalog.includes('me.ele')],
  ['legacy catalog keeps Douyin variants', legacyCatalog.includes('com.ss.android.ugc.aweme') && legacyCatalog.includes('com.ss.android.ugc.aweme.lite') && legacyCatalog.includes('com.ss.android.ugc.live')],
  ['legacy catalog keeps Xiaohongshu and Xianyu', legacyCatalog.includes('com.xingin.xhs') && legacyCatalog.includes('com.taobao.idlefish')],
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length > 0) {
  console.error('Native Android companion parity check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Native Android companion parity OK (${checks.length} checks)`);
