#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pubspecFile = resolve(root, "apps/native/pubspec.yaml");
const releaseManifestFile = resolve(root, "release-manifest.json");
const compatibilityFile = resolve(root, "release-compatibility.json");

const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

function compareVersions(left, right) {
  const a = left.split("-")[0].split(".").map(Number);
  const b = right.split("-")[0].split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (![pubspecFile, releaseManifestFile, compatibilityFile].every(existsSync)) {
  fail("原生客户端版本校验文件不存在");
} else {
  try {
    const pubspec = readFileSync(pubspecFile, "utf8");
    const nativeVersion = pubspec.match(/^version:\s+(\d+\.\d+\.\d+)/mu)?.[1];
    const releaseManifest = JSON.parse(readFileSync(releaseManifestFile, "utf8"));
    const compatibility = JSON.parse(readFileSync(compatibilityFile, "utf8"));
    const manifestVersion = releaseManifest?.nativeClientVersion;
    const minimumVersion = releaseManifest?.minimumNativeClientVersion;
    const compatibilityVersion = compatibility?.nativeClientVersion;

    if (
      !semverPattern.test(nativeVersion ?? "") ||
      manifestVersion !== nativeVersion ||
      compatibilityVersion !== nativeVersion ||
      !semverPattern.test(minimumVersion ?? "") ||
      compareVersions(nativeVersion, minimumVersion) < 0
    ) {
      fail(
        `原生客户端版本与发布清单不一致：pubspec=${nativeVersion ?? "unknown"}, ` +
          `manifest=${manifestVersion ?? "unknown"}, compatibility=${compatibilityVersion ?? "unknown"}, ` +
          `minimum=${minimumVersion ?? "unknown"}`,
      );
    } else {
      console.log(`Native release version verified: ${nativeVersion}`);
    }
  } catch {
    fail("原生客户端版本或发布清单格式无效");
  }
}
