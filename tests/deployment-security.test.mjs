import assert from "node:assert/strict";
import test from "node:test";
import { bindHostForConfig, evaluateDeploymentSecurity } from "../app/deployment-security.ts";

const cloudConfig = {
  DEPLOYMENT_MODE: "cloud",
  NEO_HSTS: "true",
  NEO_ALLOWED_HOSTS: "ledger.example.com",
  NEO_WEBDAV_ALLOWED_HOSTS: "dav.example.com",
  AUTH_PUBLIC_ORIGIN: "https://ledger.example.com",
  RESEND_API_KEY: "test-key",
  MAIL_FROM: "Neo Ledger <no-reply@example.com>",
};

test("a complete cloud deployment passes the startup gate", () => {
  const result = evaluateDeploymentSecurity(cloudConfig, "https://ledger.example.com/api/test");
  assert.equal(result.secure, true);
  assert.deepEqual(result.blocking, []);
});

test("cloud deployment fails closed when every required boundary is missing", () => {
  const result = evaluateDeploymentSecurity({ DEPLOYMENT_MODE: "cloud" }, "http://evil.example/api/test");
  assert.equal(result.secure, false);
  assert.deepEqual(
    new Set(result.blocking.map((issue) => issue.code)),
    new Set([
      "hsts_required",
      "host_allowlist_required",
      "backup_allowlist_required",
      "public_origin_required",
      "mail_required",
      "https_required",
    ]),
  );
});

test("cloud deployment rejects an untrusted request host", () => {
  const result = evaluateDeploymentSecurity(cloudConfig, "https://evil.example/api/test");
  assert.equal(result.secure, false);
  assert.ok(result.blocking.some((issue) => issue.code === "host_not_allowed"));
});

test("trusted proxy mode fails closed without its secret and source list", () => {
  const result = evaluateDeploymentSecurity({
    ...cloudConfig,
    NEO_TRUSTED_AUTH_HEADERS: "true",
  });
  assert.equal(result.secure, false);
  assert.ok(result.blocking.some((issue) => issue.code === "trusted_proxy_incomplete"));
});

test("self-hosted deployments expose actionable HTTPS warnings without blocking LAN use", () => {
  const result = evaluateDeploymentSecurity({ DEPLOYMENT_MODE: "self_hosted" });
  assert.equal(result.secure, true);
  assert.deepEqual(
    result.warnings.map((issue) => issue.code),
    ["https_recommended", "host_allowlist_recommended"],
  );
});

test("invalid modes, wildcard hosts and URL-shaped allowlist entries are rejected", () => {
  assert.equal(evaluateDeploymentSecurity({ DEPLOYMENT_MODE: "production" }).secure, false);
  const malformed = evaluateDeploymentSecurity({
    ...cloudConfig,
    NEO_ALLOWED_HOSTS: "*.example.com",
    NEO_WEBDAV_ALLOWED_HOSTS: "https://dav.example.com/path",
  });
  assert.ok(malformed.blocking.some((issue) => issue.code === "invalid_allowed_host"));
  assert.ok(malformed.blocking.some((issue) => issue.code === "invalid_webdav_host"));
});

test("local mode binds to loopback unless LAN exposure is explicitly enabled", () => {
  assert.equal(bindHostForConfig({}, "local"), "127.0.0.1");
  assert.equal(bindHostForConfig({ NEO_ENABLE_LAN: "true" }, "local"), "0.0.0.0");
  const bypass = evaluateDeploymentSecurity({
    DEPLOYMENT_MODE: "local",
    NEO_BIND_HOST: "0.0.0.0",
  });
  assert.equal(bypass.secure, false);
  assert.ok(bypass.blocking.some((issue) => issue.code === "local_bind_requires_lan_opt_in"));
});
