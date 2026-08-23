import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
const ciWorkflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("release workflow fails closed on production dependency vulnerabilities", () => {
  assert.match(workflow, /npm audit --omit=dev --audit-level=high/u);
});

test("release workflow verifies tag, package and runtime versions together", () => {
  assert.match(workflow, /verify-release-version\.mjs/u);
  assert.match(workflow, /--tag="\$\{GITHUB_REF_NAME\}"/u);
  assert.match(workflow, /--compatibility-file=release-compatibility\.json/u);
  assert.match(workflow, /--android-file=android-companion\/app\/build\.gradle\.kts/u);
  assert.match(readFileSync(new URL("../scripts/verify-release-version.mjs", import.meta.url), "utf8"), /APP_VERSION/u);
});

test("release workflow runs the complete quality gate before publishing", () => {
  assert.match(workflow, /npm run lint/u);
  assert.match(workflow, /npm test/u);
  assert.match(workflow, /git diff --check/u);
  assert.match(workflow, /npm sbom --sbom-format cyclonedx/u);
  assert.match(workflow, /npm run ga:evidence -- --mode=repository/u);
});

test("CI and release gates verify repository evidence and Android release compatibility", () => {
  assert.match(ciWorkflow, /npm run ga:evidence -- --mode=repository/u);
  assert.match(workflow, /actions\/setup-java@v4/u);
  assert.match(workflow, /android-actions\/setup-android@v3/u);
  assert.match(workflow, /sdkmanager "platforms;android-35" "build-tools;35\.0\.0"/u);
  assert.match(workflow, /working-directory: android-companion/u);
  assert.match(workflow, /testDebugUnitTest assembleDebug/u);
  assert.match(readFileSync(new URL("../.github/workflows/android-companion.yml", import.meta.url), "utf8"), /release-compatibility\.json/u);
});

test("release workflow publishes a checksummed artifact and SBOM", () => {
  assert.match(workflow, /sha256sum neo-ledger-\$\{GITHUB_REF_NAME\}-dist\.tar\.gz/u);
  assert.match(workflow, /neo-ledger-\$\{GITHUB_REF_NAME\}-dist\.tar\.gz\.sha256/u);
  assert.match(workflow, /neo-ledger-\$\{GITHUB_REF_NAME\}-sbom\.cdx\.json/u);
  assert.match(workflow, /actions\/attest-build-provenance@v2/u);
});

test("release workflow requires an approval environment and serializes duplicate tags", () => {
  assert.match(workflow, /environment:\n\s+name: release-approval/u);
  assert.match(workflow, /group: neo-ledger-release-\$\{\{ github\.ref_name \}\}/u);
  assert.match(workflow, /cancel-in-progress: false/u);
});
