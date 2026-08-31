import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const nativeAndroid = resolve(root, 'apps/native/android/app/src/main');
const nativeManifest = readFileSync(resolve(nativeAndroid, 'AndroidManifest.xml'), 'utf8');
const nativeGradle = readFileSync(resolve(root, 'apps/native/android/app/build.gradle.kts'), 'utf8');
const nativeBridge = readFileSync(
  resolve(nativeAndroid, 'java/online/eyeme/neoledger/companion/NeoCompanionBridge.java'),
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
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length > 0) {
  console.error('Native Android companion parity check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Native Android companion parity OK (${checks.length} checks)`);
