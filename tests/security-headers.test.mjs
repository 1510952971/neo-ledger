import assert from "node:assert/strict";
import test from "node:test";

const config = (await import("../next.config.ts")).default;

async function headersFor(value) {
  const previous = process.env.NEO_HSTS;
  if (value == null) delete process.env.NEO_HSTS;
  else process.env.NEO_HSTS = value;
  try {
    const rules = await config.headers();
    return new Map(rules[0].headers.map((item) => [item.key, item.value]));
  } finally {
    if (previous == null) delete process.env.NEO_HSTS;
    else process.env.NEO_HSTS = previous;
  }
}

test("security headers keep the browser policy fail-closed", async () => {
  const headers = await headersFor(null);
  assert.equal(headers.get("Content-Security-Policy").includes("default-src 'self'"), true);
  assert.equal(headers.get("Content-Security-Policy").includes("frame-ancestors 'none'"), true);
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.get("Strict-Transport-Security"), undefined);
});

test("HSTS is opt-in for HTTPS deployment mode", async () => {
  const headers = await headersFor("true");
  assert.match(headers.get("Strict-Transport-Security"), /^max-age=31536000; includeSubDomains$/u);
});
