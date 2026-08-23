import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { OPENAPI_DOCUMENT } from "../app/openapi.ts";

test("OpenAPI publishes every supported external v1 write route", () => {
  assert.equal(OPENAPI_DOCUMENT.openapi, "3.1.0");
  const routes = {
    "/api/v1/transactions": "app/api/v1/transactions/route.ts",
    "/api/v1/webhook/auto-parse": "app/api/v1/webhook/auto-parse/route.ts",
  };
  for (const [path, file] of Object.entries(routes)) {
    assert.equal(existsSync(file), true, file);
    assert.ok(OPENAPI_DOCUMENT.paths[path]?.post, path);
  }
});

test("every external operation requires bearer auth, idempotency and request tracing", () => {
  for (const item of Object.values(OPENAPI_DOCUMENT.paths)) {
    const operation = item.post;
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
    assert.ok(operation.parameters.some((parameter) => parameter.$ref?.endsWith("/IdempotencyKey")));
    assert.ok(operation.parameters.some((parameter) => parameter.$ref?.endsWith("/RequestId")));
    assert.ok(operation.responses["201"].headers["X-Request-ID"]);
    assert.equal(Object.hasOwn(operation.responses["201"].headers, "X-RateLimit-Limit"), false);
    assert.equal(Object.hasOwn(operation.responses["201"].headers, "X-RateLimit-Remaining"), false);
    for (const status of ["400", "401", "403", "408", "409", "413", "415", "422", "429", "500"])
      assert.ok(operation.responses[status], `${operation.operationId} ${status}`);
  }
});

test("OpenAPI schemas keep implementation limits and the unified error envelope", () => {
  const schemas = OPENAPI_DOCUMENT.components.schemas;
  assert.equal(schemas.ExternalTransactionInput.properties.text.maxLength, 4_000);
  assert.equal(schemas.ExternalTransactionInput.properties.amount.maximum, 100_000_000);
  assert.deepEqual(schemas.ApiError.required, ["error", "code", "requestId"]);
  assert.equal(OPENAPI_DOCUMENT.components.parameters.IdempotencyKey.required, false);
  assert.match(OPENAPI_DOCUMENT.components.parameters.IdempotencyKey.description, /externalId/);
  assert.equal(OPENAPI_DOCUMENT.components.parameters.IdempotencyKey.schema.maxLength, 128);
  assert.match(OPENAPI_DOCUMENT.components.schemas.ExternalTransactionInput.properties.time.pattern, /\\d/);
  assert.equal(OPENAPI_DOCUMENT.components.schemas.WebhookInput.properties.externalId.pattern, "^[A-Za-z0-9._:-]+$");
});
