import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("desktop launch entry is shared by the double-click command", async () => {
  const [command, launcher, packageSource] = await Promise.all([
    read("start.command"),
    read("scripts/launch-desktop.mjs"),
    read("package.json"),
  ]);
  assert.match(command, /scripts\/launch-desktop\.mjs --mode dev --open/);
  assert.match(launcher, /path\.join\(root, ["']scripts["'], ["']run\.mjs["']\)/);
  assert.match(launcher, /--mode/);
  assert.match(launcher, /PORT: String\(selected\.port\)/);
  assert.equal(JSON.parse(packageSource).scripts.start.includes("scripts/run.mjs"), true);
});
