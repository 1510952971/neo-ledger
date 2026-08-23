import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("bill row CSS maps every rendered cell to an explicit grid column", async () => {
  const css = await readFile("app/globals.css", "utf8");
  assert.match(css, /\.module-bills \.expense-item\{grid-template-columns:30px 52px minmax\(180px,1fr\) auto auto minmax\(110px,auto\) 64px/u);
  assert.match(css, /\.module-bills \.bill-row-actions\{display:flex/u);
  assert.ok(css.includes("@media(max-width:700px){.module-bills .expense-item{grid-template-columns:28px 44px minmax(0,1fr) auto minmax(86px,auto) 58px;"));
});

test("bill row has seven visual cells and keeps the amount beside actions", async () => {
  const section = await readFile("app/bill-section.tsx", "utf8");
  const start = section.indexOf("expense-item");
  const row = section.slice(section.lastIndexOf("<article", start), section.indexOf("</article>", start));
  const cells = [
    "transaction-select",
    "expense-icon category-icon",
    "expense-main",
    "flow-type",
    "reconciliation-status",
    "income-money",
    "bill-row-actions",
  ].map((marker) => row.indexOf(marker));
  assert.ok(cells.every((index) => index >= 0));
  assert.ok(cells.every((index, position) => position === 0 || index > cells[position - 1]));
});
