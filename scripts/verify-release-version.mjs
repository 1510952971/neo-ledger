#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = new Map(
  process.argv.slice(2).flatMap((value) => {
    const match = value.match(/^--([^=]+)=(.*)$/u);
    return match ? [[match[1], match[2]]] : [];
  }),
);

const packageFile = resolve(root, args.get("package-file") ?? "package.json");
const runtimeFile = resolve(root, args.get("runtime-file") ?? "app/app-version.ts");
const compatibilityFile = args.has("compatibility-file")
  ? resolve(root, args.get("compatibility-file"))
  : null;
const androidFile = args.has("android-file")
  ? resolve(root, args.get("android-file"))
  : null;
const tag = args.get("tag") ?? process.env.GITHUB_REF_NAME ?? "";

function isSemver(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value);
}

function compareVersions(left, right) {
  const parse = (value) => value.split("-")[0].split(".").map(Number);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function readAndroidVersion(source) {
  return source.match(/\bversionName\s*=\s*["']([^"']+)["']/u)?.[1];
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!existsSync(packageFile) || !existsSync(runtimeFile)) {
  fail("发布版本文件不存在");
} else {
  try {
    const packageVersion = JSON.parse(readFileSync(packageFile, "utf8")).version;
    const runtimeSource = readFileSync(runtimeFile, "utf8");
    const runtimeVersion = runtimeSource.match(
      /\bAPP_VERSION\s*=\s*["']([^"']+)["']/u,
    )?.[1];
    if (
      typeof packageVersion !== "string" ||
      !isSemver(packageVersion) ||
      runtimeVersion !== packageVersion
    ) {
      fail(`package.json 与 app/app-version.ts 版本不一致：${packageVersion ?? "unknown"} / ${runtimeVersion ?? "unknown"}`);
    } else if (tag && tag !== `v${packageVersion}`) {
      fail(`发布 tag 与项目版本不一致：${tag} / v${packageVersion}`);
    } else if (compatibilityFile && !existsSync(compatibilityFile)) {
      fail("发布兼容性清单不存在");
    } else if (androidFile && !existsSync(androidFile)) {
      fail("Android 伴侣版本文件不存在");
    } else {
      let compatibility;
      let androidVersion;
      if (compatibilityFile) {
        compatibility = JSON.parse(readFileSync(compatibilityFile, "utf8"));
        if (
          compatibility?.webVersion !== packageVersion ||
          !isSemver(compatibility?.androidCompanionVersion) ||
          !isSemver(compatibility?.minimumWebVersion) ||
          compatibility?.apiVersion !== "v1" ||
          compareVersions(packageVersion, compatibility.minimumWebVersion) < 0
        ) {
          fail(
            `发布兼容性清单与 Web 版本不一致：${compatibility?.webVersion ?? "unknown"} / ${packageVersion}`,
          );
        }
      }
      if (androidFile && !compatibilityFile) {
        fail("校验 Android 版本时必须同时提供发布兼容性清单");
      } else if (androidFile) {
        androidVersion = readAndroidVersion(readFileSync(androidFile, "utf8"));
        if (androidVersion !== compatibility.androidCompanionVersion) {
          fail(
            `Android 伴侣与发布兼容性清单版本不一致：${androidVersion ?? "unknown"} / ${compatibility.androidCompanionVersion}`,
          );
        }
      }
      if (!process.exitCode) {
        const companion = androidVersion ? `, Android companion ${androidVersion}` : "";
        console.log(`Release version verified: ${packageVersion}${companion}${tag ? ` (${tag})` : ""}`);
      }
    }
  } catch {
    fail("发布版本文件格式无效");
  }
}
