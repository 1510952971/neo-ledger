import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop sidebar stays fixed while the content page scrolls", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /html\s*\{\s*scrollbar-gutter:\s*stable;/);
  assert.match(
    css,
    /@media \(min-width: 961px\)[\s\S]*?\.finance-topbar\s*\{[\s\S]*?position:\s*fixed;/,
  );
  assert.match(
    css,
    /\.sidebar-collapsed \.finance-topbar\s*\{\s*width:\s*64px;/,
  );
});

test("quick entry action moves into the desktop sidebar", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.floating-entry-button\s*\{[^}]*left:\s*50%;[^}]*bottom:\s*max\(/,
  );
  assert.match(
    css,
    /\.floating-entry-button\s*\{[^}]*transform:\s*translateX\(-50%\);/,
  );
  assert.match(
    css,
    /\.finance-topbar \.floating-entry-button\s*\{[^}]*position:\s*static;/,
  );
});

test("sidebar profile follows the signed-in account and renders its avatar", async () => {
  const [source, authSource, css] = await Promise.all([
    readFile(new URL("../app/ledger-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/auth-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /currentAuthUser \? currentAuthUser\.username/);
  assert.doesNotMatch(source, /@\$\{currentAuthUser\.username\}/);
  assert.doesNotMatch(authSource, />@\{user\.username\}</);
  assert.match(source, /currentAuthUser\.avatarUrl/);
  assert.doesNotMatch(source, /<strong>账户号<\/strong>/);
  assert.doesNotMatch(source, /currentAuthUser\.displayName} · 已登录/);
  assert.match(css, /\.sidebar-profile \.avatar img\{[^}]*object-fit:cover/);
  assert.match(css, /\.sidebar-profile>div:last-child\{min-width:0\}/);
  assert.match(css, /\.sidebar-profile strong\s*\{[^}]*font-size:\s*11px;/);
});
