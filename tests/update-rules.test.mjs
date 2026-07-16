import assert from "node:assert/strict";
import test from "node:test";
import {
  compareVersions,
  normalizeReleaseTag,
  parseVersion,
} from "../app/update-rules.js";

test("normalizes only stable semantic release tags", () => {
  assert.equal(normalizeReleaseTag("v1.2.3"), "v1.2.3");
  assert.equal(normalizeReleaseTag("2.0.1"), "v2.0.1");
  assert.equal(normalizeReleaseTag("v1.2.3-beta.1"), null);
  assert.equal(normalizeReleaseTag("latest"), null);
});

test("compares semantic versions without string ordering mistakes", () => {
  assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("2.0.0", "2.0.0"), 0);
  assert.equal(compareVersions("1.0.0", "1.0.1"), -1);
  assert.deepEqual(parseVersion("v3.4.5"), {
    major: 3,
    minor: 4,
    patch: 5,
    prerelease: "",
  });
});
