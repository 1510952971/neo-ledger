import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readProjectFile = (name) =>
  readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("release metadata and local updater endpoint stay aligned", async () => {
  const [packageSource, appVersionSource, runnerSource] = await Promise.all([
    readProjectFile("package.json"),
    readProjectFile("app/app-version.ts"),
    readProjectFile("scripts/run.mjs"),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.match(
    appVersionSource,
    new RegExp(`APP_VERSION = ["']${packageJson.version}["']`),
  );
  assert.match(
    runnerSource,
    /mode,\s*["']--hostname["'],\s*["']0\.0\.0\.0["']/,
  );
  assert.match(
    runnerSource,
    /http:\/\/127\.0\.0\.1:3000\/api\/app-update\/health/,
  );
});

test("update checks bound external responses and timeouts", async () => {
  const source = await readProjectFile("app/api/app-update/route.ts");
  assert.match(source, /fetchWithTimeout/u);
  assert.match(source, /readResponseTextWithLimit/u);
  assert.match(source, /15_000/u);
  assert.match(source, /512 \* 1024/u);
  assert.match(source, /64 \* 1024/u);
  assert.match(source, /boundedJson/u);
});

test("remote update refusal uses the private sanitized error envelope", async () => {
  const source = await readProjectFile("app/api/app-update/route.ts");
  assert.match(source, /if \(!isLocalRequest\(request\)\)\s*return accessErrorResponse\(/u);
  assert.match(source, /new ApiAccessError\("一键更新仅允许在本机程序中执行", 403\)/u);
  assert.match(source, /"启动更新失败",\s*request/u);
});

test("successful local update responses are private and traceable", async () => {
  const source = await readProjectFile("app/api/app-update/route.ts");
  assert.match(source, /status: 202,[\s\S]*?Cache-Control.*no-store, private, max-age=0/u);
  assert.match(source, /status: 202,[\s\S]*?X-Request-ID.*requestIdFromRequest\(request\)/u);
});

test("release workflow signs and publishes the production artifact", async () => {
  const source = await readProjectFile(".github/workflows/release.yml");
  assert.match(source, /sigstore\/cosign-installer@v3\.7\.0/u);
  assert.match(source, /cosign sign-blob --yes/u);
  assert.match(source, /cosign verify-blob/u);
  assert.match(source, /sha256sum --check neo-ledger-\$\{GITHUB_REF_NAME\}-dist\.tar\.gz\.sha256/u);
  assert.match(source, /bomFormat !== "CycloneDX"/u);
  assert.match(source, /Array\.isArray\(sbom\.components\)/u);
  assert.match(source, /--output-signature neo-ledger-\$\{GITHUB_REF_NAME\}-dist\.tar\.gz\.sig/u);
  assert.match(source, /--output-certificate neo-ledger-\$\{GITHUB_REF_NAME\}-dist\.tar\.gz\.pem/u);
  assert.match(source, /--certificate-identity-regexp.*GITHUB_REPOSITORY.*release\.yml@refs\/tags.*GITHUB_REF_NAME/u);
  assert.match(source, /--certificate-oidc-issuer "https:\/\/token\.actions\.githubusercontent\.com"/u);
  assert.match(source, /gh release create[\s\S]*?neo-ledger-\$\{GITHUB_REF_NAME\}-dist\.tar\.gz\.sig/u);
  assert.match(source, /gh release create[\s\S]*?neo-ledger-\$\{GITHUB_REF_NAME\}-dist\.tar\.gz\.pem/u);
  assert.match(source, /id-token: write/u);
});

test("update health exposes only no-store, nosniff and trace headers", async () => {
  const source = await readProjectFile("app/api/app-update/health/route.ts");
  assert.match(source, /requestIdFromRequest\(request\)/u);
  assert.match(source, /"Cache-Control": "no-store"/u);
  assert.match(source, /"X-Content-Type-Options": "nosniff"/u);
  assert.match(source, /"X-Request-ID": requestId/u);
});
