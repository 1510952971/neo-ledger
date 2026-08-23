import assert from "node:assert/strict";
import test from "node:test";
import { parseWebDavLastSyncAt } from "../app/webdav-auto-sync.ts";

test("WebDAV 自动同步时间戳对非法和负值 fail-safe", () => {
  assert.equal(parseWebDavLastSyncAt(null), 0);
  assert.equal(parseWebDavLastSyncAt(""), 0);
  assert.equal(parseWebDavLastSyncAt("not-a-number"), 0);
  assert.equal(parseWebDavLastSyncAt("-1"), 0);
  assert.equal(parseWebDavLastSyncAt("1700000000000"), 1_700_000_000_000);
});
