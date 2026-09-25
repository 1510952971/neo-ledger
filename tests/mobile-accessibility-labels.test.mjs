import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const partsDirectory = new URL("../apps/native/lib/mobile/parts/", import.meta.url);
const mobileFiles = [
  new URL("../apps/native/lib/mobile_ledger_shell.dart", import.meta.url),
  new URL("../apps/native/lib/mobile/core/mobile_state_widgets.dart", import.meta.url),
  ...readdirSync(partsDirectory)
    .filter((name) => name.endsWith(".dart"))
    .map((name) => new URL(name, partsDirectory)),
];

function widgetCalls(source, widget) {
  const calls = [];
  let searchFrom = 0;
  while (true) {
    const start = source.indexOf(`${widget}(`, searchFrom);
    if (start < 0) return calls;
    const open = start + widget.length;
    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let index = open; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (char === "(") depth += 1;
      if (char === ")" && --depth === 0) {
        calls.push(source.slice(start, index + 1));
        searchFrom = index + 1;
        break;
      }
    }
    if (searchFrom === start) throw new Error("Unclosed IconButton call");
  }
}

test("native mobile icon buttons expose accessible tooltip labels", () => {
  const calls = mobileFiles.flatMap((file) =>
    widgetCalls(readFileSync(file, "utf8"), "IconButton"),
  );
  assert.ok(calls.length > 0, "expected to audit native mobile icon buttons");
  const unlabeled = calls.filter((call) => !/\btooltip\s*:/u.test(call));
  assert.deepEqual(unlabeled, []);
});

test("native mobile animations disable transitions with reduced motion", () => {
  const shell = mobileFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  const animations = ["AnimatedContainer", "AnimatedSwitcher"].flatMap((widget) =>
    widgetCalls(shell, widget),
  );
  assert.ok(animations.length > 0);
  assert.ok(
    animations.every((call) => call.includes("MediaQuery.disableAnimationsOf(context)")),
    "every native mobile animation should respect the system reduced-motion setting",
  );
});
