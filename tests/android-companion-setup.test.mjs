import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Android companion provides a one-tap paste-and-permission setup path", async () => {
  const source = await readFile("android-companion/app/src/main/java/online/eyeme/neoledger/companion/MainActivity.java", "utf8");
  assert.match(source, /一键粘贴配置并开启通知权限/u);
  assert.match(source, /if \(pasteConfiguration\(\)\)\s*startActivity\(new Intent\(Settings\.ACTION_NOTIFICATION_LISTENER_SETTINGS\)\)/u);
  assert.match(source, /private boolean pasteConfiguration\(\)/u);
  assert.match(source, /剪贴板中的密钥已清除/u);
});
