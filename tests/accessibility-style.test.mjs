import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("visible CSS text never uses sub-12px font sizes", () => {
  const undersized = [...css.matchAll(/font(?:-size)?:\s*(7|8|9|10|11)px\b/g)].map((match) => match[0]);
  assert.deepEqual(undersized, []);
});

test("keyboard, touch and reduced-motion accessibility policies stay enabled", () => {
  assert.match(css, /:focus-visible\s*\{/);
  assert.match(css, /@media\(pointer:coarse\)/);
  assert.match(css, /min-(?:width|height):44px/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});
