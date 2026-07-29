import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("scrollbars stay quiet until the pointer reaches their controls", async () => {
  const [css, manager, layout] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/scrollbar-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(css, /\*::-webkit-scrollbar\s*\{[^}]*width:\s*10px;/);
  assert.match(
    css,
    /\*::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*transparent;/,
  );
  assert.match(
    css,
    /\.scrollbar-revealed::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*rgba\(/,
  );
  assert.doesNotMatch(css, /scrollbar-width:\s*none/);
  assert.doesNotMatch(css, /::-webkit-scrollbar\s*\{\s*display:\s*none/);
  assert.match(manager, /const EDGE_SIZE = 14/);
  assert.match(manager, /document\.elementFromPoint/);
  assert.match(manager, /classList\.add\(REVEALED_CLASS\)/);
  assert.match(layout, /<ScrollbarManager \/>/);
});

test("dialogs keep their shell fixed and scroll only their content", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.expense-dialog\s*\{[^}]*overflow:\s*hidden;/);
  assert.match(
    css,
    /\.expense-dialog > \.expense-form,[^{]*\{[^}]*max-height:\s*92vh;[^}]*overflow-y:\s*auto;/,
  );
  assert.match(
    css,
    /\.expense-form > \.close-button\s*\{[^}]*position:\s*sticky;[^}]*top:\s*21px;/,
  );
  assert.match(
    css,
    /\.auth-dialog\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*overflow:\s*hidden;/,
  );
  assert.match(
    css,
    /\.auth-dialog>\.close-button\s*\{[^}]*position:\s*absolute;/,
  );
  assert.doesNotMatch(css, /--dialog-scroll-offset/);
});

test("login background stays fixed while its white panel scrolls", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.auth-gate\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*overflow:\s*hidden;/,
  );
  assert.match(
    css,
    /\.auth-gate>\.auth-panel\s*\{[^}]*max-height:\s*calc\(100dvh - 56px\);[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/,
  );
});
