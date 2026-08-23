import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../app/aesthetic-dialog.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/ledger-app.tsx", import.meta.url), "utf8");

test("aesthetic dialog owns theme presentation and explicit selection semantics", () => {
  assert.match(component, /type AestheticDialogProps/u);
  assert.match(component, /onChooseTheme: \(theme: ThemeName\) => void/u);
  assert.match(component, /aria-pressed=\{theme === item\.id\}/u);
  assert.match(component, /type="button"/u);
  assert.match(component, /id: "cream"/u);
  assert.match(component, /id: "obsidian"/u);
  assert.match(component, /id: "glacier"/u);
  assert.match(component, /id: "peach"/u);
});

test("ledger app composes aesthetic dialog without embedding its markup", () => {
  assert.match(page, /import \{ AestheticDialog \} from "\.\/aesthetic-dialog"/u);
  assert.match(page, /<AestheticDialog\b/u);
  assert.doesNotMatch(page, /<dialog\s+className="expense-dialog aesthetic-dialog"/u);
  assert.doesNotMatch(page, /THEME CENTER/u);
});
