import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("dependency update policy covers web and Android supply chains", () => {
  const source = readFileSync(".github/dependabot.yml", "utf8");
  assert.match(source, /package-ecosystem: npm/u);
  assert.match(source, /interval: weekly/u);
  assert.match(source, /package-ecosystem: gradle/u);
  assert.match(source, /directory: "\/android-companion"/u);
});

test("CI keeps vulnerability gates before release work", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  const release = readFileSync(".github/workflows/release.yml", "utf8");
  assert.match(ci, /npm audit --omit=dev --audit-level=high/u);
  assert.match(release, /npm audit --omit=dev --audit-level=high/u);
  assert.match(ci, /Generate CycloneDX SBOM/u);
});

test("monthly restore rehearsal is scheduled, reproducible and evidence-producing", () => {
  const workflow = readFileSync(".github/workflows/restore-rehearsal.yml", "utf8");
  assert.match(workflow, /schedule:/u);
  assert.match(workflow, /cron: "17 3 1 \* \*"/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /permissions:\n\s+contents: read/u);
  assert.match(workflow, /timeout-minutes: 30/u);
  assert.match(workflow, /npm run test:api/u);
  assert.match(workflow, /set -o pipefail/u);
  assert.match(workflow, /tee restore-rehearsal\.log/u);
  assert.match(workflow, /actions\/upload-artifact@v4/u);
  assert.match(workflow, /retention-days: 90/u);
});
