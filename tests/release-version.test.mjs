import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../scripts/verify-release-version.mjs", import.meta.url));

test("release version verifier accepts matching package, runtime and tag", () => {
  const output = execFileSync(process.execPath, [script, "--tag=v1.1.0"], { encoding: "utf8" });
  assert.match(output, /Release version verified: 1\.1\.0/u);
});

test("release version verifier binds the independent Android companion to its compatibility manifest", () => {
  const output = execFileSync(process.execPath, [
    script,
    "--tag=v1.1.0",
    "--compatibility-file=release-compatibility.json",
    "--android-file=android-companion/app/build.gradle.kts",
  ], { encoding: "utf8" });
  assert.match(output, /Android companion 1\.1\.14/u);
});

test("release version verifier rejects runtime drift and tag drift", () => {
  const directory = mkdtempSync(join(tmpdir(), "neo-ledger-release-version-"));
  try {
    const packageFile = join(directory, "package.json");
    const runtimeFile = join(directory, "app-version.ts");
    writeFileSync(packageFile, JSON.stringify({ version: "2.0.0" }));
    writeFileSync(runtimeFile, 'export const APP_VERSION = "2.0.1";\n');
    assert.throws(() => execFileSync(process.execPath, [
      script,
      "--package-file=" + packageFile,
      "--runtime-file=" + runtimeFile,
      "--tag=v2.0.0",
    ], { encoding: "utf8", stdio: "pipe" }));
    writeFileSync(runtimeFile, 'export const APP_VERSION = "2.0.0";\n');
    assert.throws(() => execFileSync(process.execPath, [
      script,
      "--package-file=" + packageFile,
      "--runtime-file=" + runtimeFile,
      "--tag=v2.0.1",
    ], { encoding: "utf8", stdio: "pipe" }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("release version verifier rejects Android version drift from the compatibility manifest", () => {
  const directory = mkdtempSync(join(tmpdir(), "neo-ledger-release-compatibility-"));
  try {
    const packageFile = join(directory, "package.json");
    const runtimeFile = join(directory, "app-version.ts");
    const compatibilityFile = join(directory, "compatibility.json");
    const androidFile = join(directory, "build.gradle.kts");
    writeFileSync(packageFile, JSON.stringify({ version: "2.0.0" }));
    writeFileSync(runtimeFile, 'export const APP_VERSION = "2.0.0";\n');
    writeFileSync(compatibilityFile, JSON.stringify({
      webVersion: "2.0.0",
      androidCompanionVersion: "1.4.0",
      minimumWebVersion: "2.0.0",
      apiVersion: "v1",
    }));
    writeFileSync(androidFile, 'versionName = "1.3.0"\n');
    assert.throws(() => execFileSync(process.execPath, [
      script,
      "--package-file=" + packageFile,
      "--runtime-file=" + runtimeFile,
      "--compatibility-file=" + compatibilityFile,
      "--android-file=" + androidFile,
    ], { encoding: "utf8", stdio: "pipe" }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("release version verifier rejects an unsupported external API compatibility declaration", () => {
  const directory = mkdtempSync(join(tmpdir(), "neo-ledger-release-api-compatibility-"));
  try {
    const packageFile = join(directory, "package.json");
    const runtimeFile = join(directory, "app-version.ts");
    const compatibilityFile = join(directory, "compatibility.json");
    writeFileSync(packageFile, JSON.stringify({ version: "2.0.0" }));
    writeFileSync(runtimeFile, 'export const APP_VERSION = "2.0.0";\n');
    writeFileSync(compatibilityFile, JSON.stringify({
      webVersion: "2.0.0",
      androidCompanionVersion: "1.4.0",
      minimumWebVersion: "2.0.0",
      apiVersion: "v2",
    }));
    assert.throws(() => execFileSync(process.execPath, [
      script,
      "--package-file=" + packageFile,
      "--runtime-file=" + runtimeFile,
      "--compatibility-file=" + compatibilityFile,
    ], { encoding: "utf8", stdio: "pipe" }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
