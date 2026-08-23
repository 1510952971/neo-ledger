import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/restore-snapshot.ts", import.meta.url), "utf8");

test("restore snapshots have an explicit commit marker and one-time compatibility migration", () => {
  assert.match(source, /restore_snapshot_commits/u);
  assert.match(source, /restore_snapshot_commit_migrations/u);
  assert.match(source, /INSERT OR IGNORE INTO restore_snapshot_commits\(snapshot_id,committed_at\) SELECT/u);
  assert.match(source, /INSERT INTO restore_snapshot_commits\(snapshot_id,committed_at\) VALUES/u);
});

test("snapshot reads require commit marker and failed writes clean all parts", () => {
  assert.match(source, /JOIN restore_snapshot_commits/u);
  assert.match(source, /DELETE FROM restore_snapshot_commits WHERE snapshot_id=\?/u);
  assert.match(source, /DELETE FROM restore_snapshot_chunks WHERE snapshot_id=\?/u);
  assert.match(source, /DELETE FROM restore_snapshots WHERE id=\?/u);
});

test("restore plans use an isolated chunked staging namespace with commit markers", () => {
  assert.match(source, /restore_staging\(/u);
  assert.match(source, /restore_staging_chunks/u);
  assert.match(source, /restore_staging_commits/u);
  assert.match(source, /createRestoreStaging/u);
  assert.match(source, /loadRestoreStaging/u);
  assert.match(source, /deleteRestoreStaging/u);
  assert.match(source, /恢复暂存校验失败/u);
});
