#!/usr/bin/env node
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(
  process.argv.slice(2).flatMap((value) => {
    const match = value.match(/^--([^=]+)(?:=(.*))?$/u);
    return match ? [[match[1], match[2] ?? "true"]] : [];
  }),
);
const mode = args.get("mode") ?? "repository";
const version = args.get("version") ?? JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const evidenceDir = resolve(args.get("dir") ?? process.env.NEO_GA_EVIDENCE_DIR ?? "");

const repositoryFiles = [
  ".github/workflows/release.yml",
  "docs/RELEASE_GOVERNANCE.md",
  "SECURITY.md",
  "docs/OPERATIONS_RUNBOOK.md",
  "docs/PRIVACY_POLICY_DRAFT.md",
  "docs/TERMS_DRAFT.md",
];
const externalFiles = [
  "security-penetration-" + version + ".pdf",
  "disaster-recovery-" + version + ".md",
  "device-matrix-" + version + ".md",
  "capacity-slo-" + version + ".md",
  "legal-approval-" + version + ".pdf",
  "billing-support-" + version + ".md",
];
const manifestFile = "evidence-manifest-" + version + ".json";

const placeholderPattern = /\b(?:todo|tbd|placeholder|sample|lorem ipsum)\b|待补|占位/iu;
const evidenceSourcePattern = /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/iu;
const MAX_EVIDENCE_AGE_MS = 365 * 24 * 60 * 60 * 1000;

function fileReady(path, currentMode) {
  try {
    if (!existsSync(path)) return false;
    const stat = statSync(path);
    if (!stat.isFile() || stat.size < 16) return false;
    if (currentMode === "repository") return true;

    if (path.endsWith(".pdf")) {
      if (stat.size < 32) return false;
      const descriptor = openSync(path, "r");
      try {
        const head = Buffer.alloc(5);
        const tail = Buffer.alloc(Math.min(64, stat.size));
        readSync(descriptor, head, 0, head.length, 0);
        readSync(descriptor, tail, 0, tail.length, Math.max(0, stat.size - tail.length));
        return head.toString("ascii") === "%PDF-" && tail.toString("ascii").includes("%%EOF");
      } finally {
        closeSync(descriptor);
      }
    }

    if (path.endsWith(".md")) {
      const descriptor = openSync(path, "r");
      try {
        const sample = Buffer.alloc(Math.min(64 * 1024, stat.size));
        const bytesRead = readSync(descriptor, sample, 0, sample.length, 0);
        const text = sample.subarray(0, bytesRead).toString("utf8").trim();
        return text.length >= 80 && !placeholderPattern.test(text);
      } finally {
        closeSync(descriptor);
      }
    }

    return false;
  } catch {
    return false;
  }
}

function sha256File(path) {
  const descriptor = openSync(path, "r");
  const hash = createHash("sha256");
  const chunk = Buffer.alloc(64 * 1024);
  let position = 0;
  try {
    while (true) {
      const bytesRead = readSync(descriptor, chunk, 0, chunk.length, position);
      if (!bytesRead) break;
      hash.update(chunk.subarray(0, bytesRead));
      position += bytesRead;
    }
    return hash.digest("hex");
  } finally {
    closeSync(descriptor);
  }
}

function manifestReady(path, artifactPaths) {
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size < 32 || stat.size > 256 * 1024) return false;
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    const reviewedAt = Date.parse(manifest.reviewedAt);
    const reviewers = manifest.reviewers.map((reviewer) =>
      typeof reviewer === "string" ? reviewer.trim() : reviewer,
    );
    if (
      manifest?.version !== version ||
      typeof manifest.reviewedAt !== "string" ||
      Number.isNaN(reviewedAt) ||
      reviewedAt > Date.now() ||
      reviewedAt < Date.now() - MAX_EVIDENCE_AGE_MS ||
      !Array.isArray(manifest.reviewers) ||
      reviewers.length < 2 ||
      new Set(reviewers).size !== reviewers.length ||
      reviewers.some((reviewer) => typeof reviewer !== "string" || reviewer.length < 2) ||
      !manifest.artifacts ||
      typeof manifest.artifacts !== "object" ||
      Array.isArray(manifest.artifacts)
    ) return false;

    const expectedArtifactNames = new Set(
      artifactPaths.map((artifactPath) => artifactPath.slice(artifactPath.lastIndexOf("/") + 1)),
    );
    const actualArtifactNames = Object.keys(manifest.artifacts);
    if (
      actualArtifactNames.length !== expectedArtifactNames.size ||
      actualArtifactNames.some((name) => !expectedArtifactNames.has(name))
    ) return false;

    return artifactPaths.every((artifactPath) => {
      const name = artifactPath.slice(artifactPath.lastIndexOf("/") + 1);
      const entry = manifest.artifacts[name];
      return entry &&
        typeof entry.source === "string" &&
        entry.source.trim().length >= 8 &&
        evidenceSourcePattern.test(entry.source.trim()) &&
        !placeholderPattern.test(entry.source) &&
        typeof entry.expiresAt === "string" &&
        !Number.isNaN(Date.parse(entry.expiresAt)) &&
        Date.parse(entry.expiresAt) > Date.now() &&
        /^[a-f0-9]{64}$/u.test(entry.sha256) &&
        entry.sha256 === sha256File(artifactPath) &&
        Array.isArray(entry.reviewedBy) &&
        entry.reviewedBy.length > 0 &&
        entry.reviewedBy.every((reviewer) =>
          typeof reviewer === "string" &&
          reviewer.trim().length >= 2 &&
          reviewers.includes(reviewer.trim()),
        );
    });
  } catch {
    return false;
  }
}

if (!["repository", "ga"].includes(mode)) {
  console.error("用法：node scripts/verify-ga-evidence.mjs --mode=repository|ga [--dir=证据目录] [--version=x.y.z]");
  process.exitCode = 2;
} else {
  const required = mode === "repository"
    ? repositoryFiles.map((file) => resolve(root, file))
    : externalFiles.map((file) => resolve(evidenceDir, file));
  const results = required.map((file) => ({ file: file.replace(root + "/", ""), ready: fileReady(file, mode) }));
  if (mode === "ga") {
    const manifestPath = resolve(evidenceDir, manifestFile);
    results.push({
      file: manifestPath.replace(root + "/", ""),
      ready: manifestReady(manifestPath, required),
    });
  }
  for (const result of results) console.log((result.ready ? "PASS " : "FAIL ") + result.file);
  if (mode === "ga" && !args.get("dir") && !process.env.NEO_GA_EVIDENCE_DIR) {
    console.error("GA 模式必须通过 --dir 或 NEO_GA_EVIDENCE_DIR 指定受控证据目录");
    process.exitCode = 1;
  } else if (results.some((result) => !result.ready)) {
    console.error((mode === "ga" ? "GA" : "仓库") + "证据不完整，禁止通过发布闸门");
    process.exitCode = 1;
  }
}
