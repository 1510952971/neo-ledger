import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const manifest = read("../apps/native/android/app/src/main/AndroidManifest.xml");
const gradle = read("../apps/native/android/app/build.gradle.kts");
const activity = read(
  "../apps/native/android/app/src/main/kotlin/online/eyeme/neo_ledger/MainActivity.kt",
);
const bridge = read(
  "../apps/native/android/app/src/main/java/online/eyeme/neoledger/companion/NeoCompanionBridge.java",
);
const updater = read(
  "../apps/native/android/app/src/main/java/online/eyeme/neoledger/companion/NativeAppUpdater.java",
);
const parser = read(
  "../android-companion/app/src/main/java/online/eyeme/neoledger/companion/PaymentScreenParser.java",
);
const accessibilityService = read(
  "../android-companion/app/src/main/java/online/eyeme/neoledger/companion/NeoPaymentAccessibilityService.java",
);
const catalog = read(
  "../android-companion/app/src/main/java/online/eyeme/neoledger/companion/PaymentAppCatalog.java",
);

test("native Android manifest carries the legacy companion services", () => {
  assert.match(manifest, /REQUEST_INSTALL_PACKAGES/);
  assert.match(manifest, /NeoApkFileProvider/);
  assert.match(manifest, /NeoNotificationListener/);
  assert.match(manifest, /NeoPaymentAccessibilityService/);
  assert.match(manifest, /SyncJobService/);
  assert.match(manifest, /BootReceiver/);
  assert.match(manifest, /payment_accessibility_service/);
});

test("native Android embeds the legacy implementation and exposes its bridge", () => {
  assert.match(
    gradle,
    /java\.srcDirs\("\.\.\/\.\.\/\.\.\/\.\.\/android-companion\/app\/src\/main\/java"\)/,
  );
  assert.match(activity, /online\.eyeme\.neo_ledger\/companion/);
  for (const method of [
    "configure",
    "status",
    "openNotificationSettings",
    "openAccessibilitySettings",
    "openAutostartSettings",
    "openBatterySettings",
    "sendTest",
    "flushPending",
    "installUpdate",
  ]) {
    assert.match(activity, new RegExp(`\\"${method}\\"`));
  }
  for (const method of [
    "configure",
    "status",
    "sendTest",
    "flushPending",
    "installUpdate",
  ]) {
    assert.match(bridge, new RegExp(`\\b${method}\\b`));
  }
});

test("Android updater only installs verified GitHub APKs", () => {
  assert.match(updater, /https:\/\/github\.com\//);
  assert.match(updater, /objects\.githubusercontent\.com/);
  assert.match(updater, /SHA-256|sha256/i);
  assert.match(updater, /neo-ledger-android-/);
  assert.match(updater, /value\.matches\("neo-ledger-android-/);
  assert.match(updater, /\.part/);
  assert.match(updater, /renameTo/);
  assert.match(updater, /ACTION_INSTALL_PACKAGE/);
  assert.match(updater, /NeoApkFileProvider\.uriForFile/);
});

test("payment screen recognition is strict and read-only", () => {
  for (const marker of [
    "PAYMENT_SUCCESS",
    "MONEY",
    "PAYMENT_METADATA",
    "REJECT",
    "hasFreshPaymentTime",
    "仅购买成功页",
  ]) {
    assert.match(parser, new RegExp(marker));
  }
  assert.match(accessibilityService, /never clicks, types, approves, or initiates a payment/i);
  assert.doesNotMatch(accessibilityService, /\.setText\s*\(|ACTION_CLICK|TYPE_TEXT|performAction\s*\(/u);
});

test("payment catalog includes marketplace and social commerce apps", () => {
  for (const packageName of [
    "TAOBAO",
    "JD",
    "MEITUAN",
    "PINDUODUO",
    "ELEME",
    "UNIONPAY",
    "DOUYIN",
    "XIAOHONGSHU",
    "XIANYU",
  ]) {
    assert.match(catalog, new RegExp(packageName));
  }
  for (const sourceName of ["抖音", "小红书", "闲鱼"]) {
    assert.match(catalog, new RegExp(sourceName));
  }
});
