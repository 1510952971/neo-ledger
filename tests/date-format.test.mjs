import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("rendered date formatting is deterministic across SSR and browser locales", async () => {
  const source = await readFile("app/date-format.ts", "utf8");
  assert.match(source, /DISPLAY_OFFSET_MS = 8 \* 60 \* 60 \* 1000/u);
  assert.match(source, /getUTCFullYear\(\)/u);
  assert.match(source, /getUTCMonth\(\)/u);
  assert.match(source, /getUTCDate\(\)/u);
  assert.doesNotMatch(source, /new Intl\.DateTimeFormat|toLocaleString/u);
});

test("bill and transaction timestamp renderers use the shared deterministic formatter", async () => {
  const [bill, ledger] = await Promise.all([
    readFile("app/bill-section.tsx", "utf8"),
    readFile("app/ledger-app.tsx", "utf8"),
  ]);
  assert.match(bill, /import \{ formatAppDateTime \} from "\.\/date-format"/u);
  assert.match(bill, /return formatAppDateTime\(value\)/u);
  assert.match(ledger, /import \{ formatAppDateTime, parseAppDate \} from "\.\/date-format"/u);
  assert.match(ledger, /formatAppDateTime\(item\.occurredAt\)/u);
  assert.match(ledger, /formatAppDateTime\(value, true\)/u);
});
