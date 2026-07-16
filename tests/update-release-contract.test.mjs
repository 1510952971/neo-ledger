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
    /mode,\s*["']--hostname["'],\s*["']127\.0\.0\.1["']/,
  );
  assert.match(
    runnerSource,
    /http:\/\/127\.0\.0\.1:3000\/api\/app-update\/health/,
  );
});
