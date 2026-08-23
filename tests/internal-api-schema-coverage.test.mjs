import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const apiRoot = path.resolve("app/api");
const protocolRoutes = new Set([
  "auth/email-code/route.ts",
  "auth/mfa/route.ts",
  "auth/passkeys/route.ts",
  "auth/reset-password/route.ts",
  "auth/route.ts",
  "offline-sync/route.ts",
  "p2p/crdt/route.ts",
  "p2p/discovery/route.ts",
  "p2p/packages/route.ts",
  "p2p/signals/route.ts",
  "transactions/route.ts",
  "v1/ai/chat/route.ts",
]);

function routeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory()
      ? routeFiles(absolute)
      : entry.name === "route.ts"
        ? [absolute]
        : [];
  });
}

test("ordinary internal write routes cannot bypass the shared schema layer", () => {
  const directParsers = routeFiles(apiRoot)
    .filter((file) => /await\s+(?:request|req)\.json/u.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(apiRoot, file))
    .sort();
  assert.deepEqual(directParsers, []);
});

test("shared internal schema reader keeps JSON parsing bounded", () => {
  const source = readFileSync("app/internal-api-contract.ts", "utf8");
  assert.match(source, /MAX_INTERNAL_API_BODY_BYTES/u);
  assert.match(source, /readJsonWithLimit<unknown>/u);
  assert.doesNotMatch(source, /request\.json\(/u);
});

test("protocol routes use a bounded JSON reader", () => {
  const unbounded = [...protocolRoutes]
    .filter((relative) => !/readJsonWithLimit/u.test(readFileSync(path.join(apiRoot, relative), "utf8")))
    .sort();
  assert.deepEqual(unbounded, []);
});

test("Passkey protocol uses the bounded JSON reader", () => {
  const source = readFileSync(path.join(apiRoot, "auth/passkeys/route.ts"), "utf8");
  assert.match(source, /MAX_PASSKEY_BODY_BYTES/u);
  assert.match(source, /readJsonWithLimit/u);
  assert.doesNotMatch(source, /request\.json\(/u);
});

test("pending transaction writes use the shared schema reader", () => {
  const source = readFileSync(path.join(apiRoot, "pending-transactions/route.ts"), "utf8");
  assert.match(source, /readPendingTransactionInput/u);
  assert.doesNotMatch(source, /readJsonWithLimit/u);
});

test("ledger-scoped GET routes have an explicit access-error boundary", () => {
  const offenders = routeFiles(apiRoot)
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      if (!source.includes("claimAndRequireLedger") || !source.includes("export async function GET"))
        return false;
      const getBody = source.split("export async function GET", 2)[1]?.split("export async function", 2)[0] ?? "";
      return !/guardedApiResponse|try\s*\{/u.test(getBody);
    })
    .map((file) => path.relative(apiRoot, file))
    .sort();
  assert.deepEqual(offenders, []);
});
