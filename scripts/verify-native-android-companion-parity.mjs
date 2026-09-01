import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const nativeAndroid = resolve(root, 'apps/native/android/app/src/main');
const legacyJava = resolve(root, 'android-companion/app/src/main/java');
const legacyResources = resolve(root, 'android-companion/app/src/main/res');
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
  resolve(legacyJava, 'online/eyeme/neoledger/companion/PaymentAppCatalog.java'),
  'utf8',
);

function collectJavaFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectJavaFiles(path, relative);
    return entry.isFile() && entry.name.endsWith('.java') ? [relative] : [];
  });
}

function sameFile(left, right) {
  return readFileSync(left).equals(readFileSync(right));
}

const sharedJavaFiles = collectJavaFiles(legacyJava);
const requiredSharedJavaFiles = [
  'online/eyeme/neoledger/companion/ApiTime.java',
  'online/eyeme/neoledger/companion/AppUpdateCallback.java',
  'online/eyeme/neoledger/companion/AppUpdater.java',
  'online/eyeme/neoledger/companion/BootReceiver.java',
  'online/eyeme/neoledger/companion/EndpointNormalizer.java',
  'online/eyeme/neoledger/companion/HttpSender.java',
  'online/eyeme/neoledger/companion/MainActivity.java',
  'online/eyeme/neoledger/companion/NeoApkFileProvider.java',
  'online/eyeme/neoledger/companion/NeoNotificationListener.java',
  'online/eyeme/neoledger/companion/NeoPaymentAccessibilityService.java',
  'online/eyeme/neoledger/companion/NotificationEventIdentity.java',
  'online/eyeme/neoledger/companion/PaymentAppCatalog.java',
  'online/eyeme/neoledger/companion/PaymentNotificationParser.java',
  'online/eyeme/neoledger/companion/PaymentObservationBuffer.java',
  'online/eyeme/neoledger/companion/PaymentScreenParser.java',
  'online/eyeme/neoledger/companion/PendingEventStore.java',
  'online/eyeme/neoledger/companion/SettingsStore.java',
  'online/eyeme/neoledger/companion/SyncJobService.java',
  'online/eyeme/neoledger/companion/SyncScheduler.java',
];

const nativeAccessibilityResource = resolve(nativeAndroid, 'res/xml/payment_accessibility_service.xml');
const legacyAccessibilityResource = resolve(legacyResources, 'xml/payment_accessibility_service.xml');
const nativeNetworkResource = resolve(nativeAndroid, 'res/xml/network_security_config.xml');
const legacyNetworkResource = resolve(legacyResources, 'xml/network_security_config.xml');

const checks = [
  [
    'native APK compiles the shared companion source tree',
    nativeGradle.includes('java.srcDirs("../../../../android-companion/app/src/main/java")'),
  ],
  [
    `native APK sees every legacy companion Java source (${sharedJavaFiles.length} files)`,
    requiredSharedJavaFiles.every((file) => sharedJavaFiles.includes(file)) &&
      sharedJavaFiles.every((file) => existsSync(resolve(legacyJava, file))),
  ],
  ['shared companion source tree includes the notification parser', sharedJavaFiles.includes('online/eyeme/neoledger/companion/PaymentNotificationParser.java')],
  ['shared companion source tree includes the payment-screen parser', sharedJavaFiles.includes('online/eyeme/neoledger/companion/PaymentScreenParser.java')],
  ['shared companion source tree includes pending queue and scheduler', sharedJavaFiles.includes('online/eyeme/neoledger/companion/PendingEventStore.java') && sharedJavaFiles.includes('online/eyeme/neoledger/companion/SyncScheduler.java')],
  ['shared companion source tree includes boot/update recovery', sharedJavaFiles.includes('online/eyeme/neoledger/companion/BootReceiver.java') && sharedJavaFiles.includes('online/eyeme/neoledger/companion/AppUpdater.java')],
  ['native manifest disables backup for notification/payment data', nativeManifest.includes('android:allowBackup="false"')],
  ['native manifest keeps the companion network security policy', nativeManifest.includes('android:networkSecurityConfig="@xml/network_security_config"')],
  ['native manifest exposes the notification listener service', nativeManifest.includes('android.service.notification.NotificationListenerService')],
  ['native manifest exposes the payment accessibility service', nativeManifest.includes('android.accessibilityservice.AccessibilityService')],
  ['notification listener keeps its user-facing label', nativeManifest.includes('Neo Ledger 支付通知监听')],
  ['accessibility service keeps its user-facing label', nativeManifest.includes('Neo Ledger 支付完成界面识别')],
  ['payment accessibility configuration is packaged and unchanged', existsSync(nativeAccessibilityResource) && sameFile(nativeAccessibilityResource, legacyAccessibilityResource)],
  ['network security configuration is packaged and unchanged', existsSync(nativeNetworkResource) && sameFile(nativeNetworkResource, legacyNetworkResource)],
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
  ['Flutter bridge is wired to the full companion configuration', nativeActivity.includes('NeoCompanionBridge.configure(')],
  ['Flutter bridge is wired to live companion status', nativeActivity.includes('NeoCompanionBridge.status(this)')],
  ['Flutter bridge is wired to pending delivery', nativeActivity.includes('NeoCompanionBridge.flushPending(this)')],
  ['Flutter bridge is wired to test delivery', nativeActivity.includes('NeoCompanionBridge.sendTest(this)')],
  ['Flutter bridge is wired to APK update installation', nativeActivity.includes('NeoCompanionBridge.installUpdate(')],
  ['native bridge defines the companion status broadcast action', nativeBridge.includes('public static final String ACTION_STATUS')],
  ['native activity exposes the live companion status event channel', nativeActivity.includes('EventChannel') && nativeActivity.includes('companion_status') && nativeActivity.includes('NeoCompanionBridge.ACTION_STATUS')],
  ['Flutter subscribes to live companion status events', nativeFlutter.includes("EventChannel(") && nativeFlutter.includes('online.eyeme.neo_ledger/companion_status') && nativeFlutter.includes('receiveBroadcastStream')],
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
