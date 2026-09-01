import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../scripts/verify-native-release-version.mjs", import.meta.url));
const pubspecFile = fileURLToPath(new URL("../apps/native/pubspec.yaml", import.meta.url));

test("native release metadata matches the Flutter client version", () => {
  const output = execFileSync(process.execPath, [script], { encoding: "utf8" });
  const nativeVersion = readFileSync(pubspecFile, "utf8").match(/^version:\s+(\d+\.\d+\.\d+)/mu)?.[1];

  assert.ok(nativeVersion, "Flutter client version must be declared in pubspec.yaml");
  assert.match(output, new RegExp(`Native release version verified: ${nativeVersion.replaceAll(".", "\\.")}`, "u"));
});
