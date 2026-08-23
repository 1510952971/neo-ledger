import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("data center dialog gives dense sync cards a bounded responsive container", async () => {
  const css = await readFile("app/globals.css", "utf8");
  assert.match(css, /\.data-dialog\[open\]\{width:min\(94vw,880px\)!important;max-width:880px!important/u);
  assert.match(css, /\.data-dialog \.webdav-tower\{grid-template-columns:minmax\(140px,170px\) minmax\(0,1fr\)\}/u);
  assert.match(css, /\.data-dialog \.webdav-content input,.data-dialog \.webdav-content select\{box-sizing:border-box;width:100%;min-width:0\}/u);
  assert.match(css, /\.data-dialog \.quick-sync-status\{display:grid!important;grid-template-columns:repeat\(auto-fit,minmax\(150px,1fr\)\)/u);
  assert.match(css, /\.data-dialog \.quick-sync-settings\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);min-width:0\}/u);
  assert.match(css, /@media\(max-width:720px\)\{\n  \.data-dialog\[open\]\{width:100%!important/u);
});

test("sync cards opt out of min-content overflow and wrap token actions", async () => {
  const css = await readFile("app/globals.css", "utf8");
  assert.match(css, /\.data-dialog \.webdav-tower,.data-dialog \.p2p-star-cluster,.data-dialog \.geek-channel\{min-width:0\}/u);
  assert.match(css, /\.data-dialog \.quick-sync-token\{display:flex!important;flex-wrap:wrap/u);
  assert.match(css, /\.data-dialog \.quick-sync-token code\{min-width:0;flex:1 1 240px/u);
});
