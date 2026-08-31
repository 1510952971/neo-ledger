import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../scripts/verify-native-release-version.mjs", import.meta.url));

test("native release metadata matches the Flutter client version", () => {
  const output = execFileSync(process.execPath, [script], { encoding: "utf8" });
  assert.match(output, /Native release version verified: 1\.2\.7/u);
});
