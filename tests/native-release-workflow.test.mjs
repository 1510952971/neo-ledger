import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/native-release.yml", import.meta.url),
  "utf8",
);

test("native Windows release validates the installer signature", () => {
  assert.match(workflow, /Get-AuthenticodeSignature -FilePath \$installer/u);
  assert.match(workflow, /\$signature\.Status -ne 'Valid'/u);
  assert.match(workflow, /Set-Content -Path 'windows-signature-status\.txt'/u);
  assert.match(workflow, /apps\/native\/windows-signature-status\.txt/u);
});

test("native release requires every installable asset and excludes unsigned iOS", () => {
  assert.match(workflow, /neo-ledger-android-\$\{VERSION\}\.apk/u);
  assert.match(workflow, /neo-ledger-android-\$\{VERSION\}\.aab/u);
  assert.match(workflow, /neo-ledger-windows-\$\{VERSION\}\.zip/u);
  assert.match(workflow, /neo-ledger-windows-\$\{VERSION\}-setup\.exe/u);
  assert.match(workflow, /neo-ledger-web-\$\{VERSION\}\.tar\.gz/u);
  assert.match(workflow, /neo-ledger-ios-unsigned-\*\.zip/u);
  assert.match(workflow, /installerSigned": true/u);
});
