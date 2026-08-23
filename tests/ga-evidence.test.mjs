import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = new URL("../scripts/verify-ga-evidence.mjs", import.meta.url);
const scriptPath = fileURLToPath(script);

test("仓库发布证据检查通过", () => {
  const output = execFileSync(process.execPath, [scriptPath, "--mode=repository"], { encoding: "utf8" });
  assert.match(output, /PASS .*RELEASE_GOVERNANCE\.md/u);
});

test("GA 证据目录缺材料时失败", () => {
  const directory = mkdtempSync(join(tmpdir(), "neo-ledger-ga-"));
  try {
    assert.throws(() => execFileSync(process.execPath, [scriptPath, "--mode=ga", "--dir=" + directory, "--version=9.9.9"], { encoding: "utf8", stdio: "pipe" }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("GA 证据目录齐全时通过", () => {
  const directory = mkdtempSync(join(tmpdir(), "neo-ledger-ga-"));
  try {
    const version = "9.9.9";
    const artifacts = {};
    for (const name of [
      "security-penetration-" + version + ".pdf",
      "disaster-recovery-" + version + ".md",
      "device-matrix-" + version + ".md",
      "capacity-slo-" + version + ".md",
      "legal-approval-" + version + ".pdf",
      "billing-support-" + version + ".md",
    ]) {
      const content = name.endsWith(".pdf")
        ? "%PDF-1.7\n1 0 obj\n<< /Type /Report >>\nendobj\n%%EOF\n"
        : "# Verified release evidence\n\nThis controlled record identifies the reviewer, date, scope, environment, observed result, and retained supporting artifacts for the Neo Ledger release decision.\n";
      writeFileSync(join(directory, name), content);
      artifacts[name] = {
        source: "controlled-release-record://neo-ledger/9.9.9/" + name,
        sha256: createHash("sha256").update(content).digest("hex"),
        reviewedBy: ["release-security"],
        expiresAt: "2099-12-31T23:59:59Z",
      };
    }
    writeFileSync(join(directory, "evidence-manifest-" + version + ".json"), JSON.stringify({
      version,
      reviewedAt: "2026-08-18T12:00:00Z",
      reviewers: ["release-security", "product-owner"],
      artifacts,
    }));
    const output = execFileSync(process.execPath, [scriptPath, "--mode=ga", "--dir=" + directory, "--version=" + version], { encoding: "utf8" });
    assert.match(output, /PASS .*security-penetration-9\.9\.9\.pdf/u);
    assert.match(output, /PASS .*evidence-manifest-9\.9\.9\.json/u);
    const manifestPath = join(directory, "evidence-manifest-" + version + ".json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.artifacts["unreviewed-extra.md"] = {
      source: "controlled-release-record://neo-ledger/9.9.9/unreviewed-extra.md",
      sha256: "0".repeat(64),
      reviewedBy: ["release-security"],
      expiresAt: "2099-12-31T23:59:59Z",
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => execFileSync(process.execPath, [scriptPath, "--mode=ga", "--dir=" + directory, "--version=" + version], { encoding: "utf8", stdio: "pipe" }));
    delete manifest.artifacts["unreviewed-extra.md"];
    manifest.artifacts["security-penetration-9.9.9.pdf"].source = "not-a-traceable-source";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => execFileSync(process.execPath, [scriptPath, "--mode=ga", "--dir=" + directory, "--version=" + version], { encoding: "utf8", stdio: "pipe" }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("GA 证据 manifest 拒绝篡改后的材料", () => {
  const directory = mkdtempSync(join(tmpdir(), "neo-ledger-ga-"));
  try {
    const version = "9.9.9";
    const names = [
      "security-penetration-" + version + ".pdf",
      "disaster-recovery-" + version + ".md",
      "device-matrix-" + version + ".md",
      "capacity-slo-" + version + ".md",
      "legal-approval-" + version + ".pdf",
      "billing-support-" + version + ".md",
    ];
    const artifacts = {};
    for (const name of names) {
      const content = name.endsWith(".pdf")
        ? "%PDF-1.7\n1 0 obj\n<< /Type /Report >>\nendobj\n%%EOF\n"
        : "# Verified release evidence\n\nThis controlled record identifies the reviewer, date, scope, environment, observed result, and retained supporting artifacts for the Neo Ledger release decision.\n";
      writeFileSync(join(directory, name), content);
      artifacts[name] = { source: "controlled-release-record://neo-ledger/9.9.9/" + name, sha256: "0".repeat(64), reviewedBy: ["release-security"], expiresAt: "2099-12-31T23:59:59Z" };
    }
    writeFileSync(join(directory, "evidence-manifest-" + version + ".json"), JSON.stringify({ version, reviewedAt: "2026-08-18T12:00:00Z", reviewers: ["release-security", "product-owner"], artifacts }));
    assert.throws(() => execFileSync(process.execPath, [scriptPath, "--mode=ga", "--dir=" + directory, "--version=" + version], { encoding: "utf8", stdio: "pipe" }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("GA 证据 manifest 拒绝过期材料或未列入审阅人", () => {
  const directory = mkdtempSync(join(tmpdir(), "neo-ledger-ga-"));
  try {
    const version = "9.9.9";
    const names = [
      "security-penetration-" + version + ".pdf",
      "disaster-recovery-" + version + ".md",
      "device-matrix-" + version + ".md",
      "capacity-slo-" + version + ".md",
      "legal-approval-" + version + ".pdf",
      "billing-support-" + version + ".md",
    ];
    const artifacts = {};
    for (const name of names) {
      const content = name.endsWith(".pdf")
        ? "%PDF-1.7\n1 0 obj\n<< /Type /Report >>\nendobj\n%%EOF\n"
        : "# Verified release evidence\n\nThis controlled record identifies the reviewer, date, scope, environment, observed result, and retained supporting artifacts for the Neo Ledger release decision.\n";
      writeFileSync(join(directory, name), content);
      artifacts[name] = {
        source: "controlled-release-record://neo-ledger/9.9.9/" + name,
        sha256: createHash("sha256").update(content).digest("hex"),
        reviewedBy: ["unlisted-reviewer"],
        expiresAt: "2020-01-01T00:00:00Z",
      };
    }
    writeFileSync(join(directory, "evidence-manifest-" + version + ".json"), JSON.stringify({ version, reviewedAt: "2026-08-18T12:00:00Z", reviewers: ["release-security", "product-owner"], artifacts }));
    assert.throws(() => execFileSync(process.execPath, [scriptPath, "--mode=ga", "--dir=" + directory, "--version=" + version], { encoding: "utf8", stdio: "pipe" }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("GA 证据 manifest 拒绝单审阅人和未来审阅时间", () => {
  const directory = mkdtempSync(join(tmpdir(), "neo-ledger-ga-"));
  try {
    const version = "9.9.9";
    const artifacts = {};
    for (const name of [
      "security-penetration-" + version + ".pdf",
      "disaster-recovery-" + version + ".md",
      "device-matrix-" + version + ".md",
      "capacity-slo-" + version + ".md",
      "legal-approval-" + version + ".pdf",
      "billing-support-" + version + ".md",
    ]) {
      const content = name.endsWith(".pdf")
        ? "%PDF-1.7\n1 0 obj\n<< /Type /Report >>\nendobj\n%%EOF\n"
        : "# Verified release evidence\n\nThis controlled record identifies the reviewer, date, scope, environment, observed result, and retained supporting artifacts for the Neo Ledger release decision.\n";
      writeFileSync(join(directory, name), content);
      artifacts[name] = {
        source: "controlled-release-record://neo-ledger/9.9.9/" + name,
        sha256: createHash("sha256").update(content).digest("hex"),
        reviewedBy: ["release-security"],
        expiresAt: "2099-12-31T23:59:59Z",
      };
    }
    const manifestPath = join(directory, "evidence-manifest-" + version + ".json");
    writeFileSync(manifestPath, JSON.stringify({ version, reviewedAt: "2026-08-18T12:00:00Z", reviewers: ["release-security"], artifacts }));
    assert.throws(() => execFileSync(process.execPath, [scriptPath, "--mode=ga", "--dir=" + directory, "--version=" + version], { encoding: "utf8", stdio: "pipe" }));
    writeFileSync(manifestPath, JSON.stringify({ version, reviewedAt: "2099-01-01T00:00:00Z", reviewers: ["release-security", "product-owner"], artifacts }));
    assert.throws(() => execFileSync(process.execPath, [scriptPath, "--mode=ga", "--dir=" + directory, "--version=" + version], { encoding: "utf8", stdio: "pipe" }));
    writeFileSync(manifestPath, JSON.stringify({ version, reviewedAt: "2020-01-01T00:00:00Z", reviewers: ["release-security", "product-owner"], artifacts }));
    assert.throws(() => execFileSync(process.execPath, [scriptPath, "--mode=ga", "--dir=" + directory, "--version=" + version], { encoding: "utf8", stdio: "pipe" }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("GA 证据拒绝占位 Markdown 和伪造 PDF", () => {
  const directory = mkdtempSync(join(tmpdir(), "neo-ledger-ga-"));
  try {
    const version = "9.9.9";
    for (const name of [
      "security-penetration-" + version + ".pdf",
      "disaster-recovery-" + version + ".md",
      "device-matrix-" + version + ".md",
      "capacity-slo-" + version + ".md",
      "legal-approval-" + version + ".pdf",
      "billing-support-" + version + ".md",
    ]) writeFileSync(join(directory, name), name.endsWith(".pdf") ? "not really a PDF with enough bytes........\n" : "# TODO placeholder\n".padEnd(100, "x"));

    assert.throws(() => execFileSync(process.execPath, [scriptPath, "--mode=ga", "--dir=" + directory, "--version=" + version], { encoding: "utf8", stdio: "pipe" }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
