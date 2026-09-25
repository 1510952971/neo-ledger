import test from "node:test";
import assert from "node:assert/strict";
import { runIdempotentMobileWrite } from "../app/mobile-idempotency.js";

function memoryRepository() {
  const records = new Map();
  return {
    records,
    async claim({ ownerId, key, requestHash, leaseUntil, now }) {
      const storageKey = `${ownerId}:${key}`;
      const current = records.get(storageKey);
      if (!current) {
        records.set(storageKey, { requestHash, leaseUntil });
        return { kind: "claimed" };
      }
      if (current.requestHash !== requestHash) return { kind: "conflict" };
      if (current.status != null) return { kind: "replay", ...current };
      if (current.leaseUntil > now) return { kind: "in_progress" };
      current.leaseUntil = leaseUntil;
      return { kind: "claimed" };
    },
    async complete({ ownerId, key, requestHash, ...response }) {
      records.set(`${ownerId}:${key}`, { requestHash, ...response });
    },
    async release({ ownerId, key }) {
      records.delete(`${ownerId}:${key}`);
    },
  };
}

function request(body, key = "native-write-12345678") {
  return new Request("https://ledger.example/api/accounts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(body),
  });
}

test("replays a successful response for the same authenticated write", async () => {
  const repository = memoryRepository();
  let executions = 0;
  const execute = async () => {
    executions += 1;
    return Response.json({ id: 7 }, { status: 201 });
  };
  const first = await runIdempotentMobileWrite({
    request: request({ name: "现金" }),
    ownerId: "user:1",
    repository,
    execute,
  });
  const replay = await runIdempotentMobileWrite({
    request: request({ name: "现金" }),
    ownerId: "user:1",
    repository,
    execute,
  });
  assert.equal(first.status, 201);
  assert.equal(replay.status, 201);
  assert.deepEqual(await replay.json(), { id: 7 });
  assert.equal(executions, 1);
});

test("rejects reusing a key for another payload or while the first request is active", async () => {
  const repository = memoryRepository();
  await repository.claim({
    ownerId: "user:1",
    key: "native-write-12345678",
    requestHash: "reserved-hash",
    leaseUntil: Date.now() + 60_000,
    now: Date.now(),
  });
  const conflict = await runIdempotentMobileWrite({
    request: request({ name: "投资账户" }),
    ownerId: "user:1",
    repository,
    execute: async () => Response.json({ ok: true }),
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, "idempotency_conflict");

  let executed = false;
  const pending = await runIdempotentMobileWrite({
    request: request({ name: "现金" }),
    ownerId: "user:1",
    repository: {
      async claim() { return { kind: "in_progress" }; },
      async complete() {},
      async release() {},
    },
    execute: async () => {
      executed = true;
      return Response.json({ ok: true });
    },
  });
  assert.equal(pending.status, 409);
  assert.equal((await pending.json()).code, "idempotency_in_progress");
  assert.equal(executed, false);
});

test("does not cache failed responses, allowing a safe retry of validation failures", async () => {
  const repository = memoryRepository();
  let executions = 0;
  const execute = async () => {
    executions += 1;
    return Response.json({ error: "invalid" }, { status: 400 });
  };
  await runIdempotentMobileWrite({
    request: request({ name: "" }),
    ownerId: "user:1",
    repository,
    execute,
  });
  await runIdempotentMobileWrite({
    request: request({ name: "" }),
    ownerId: "user:1",
    repository,
    execute,
  });
  assert.equal(executions, 2);
  assert.equal(repository.records.size, 0);
});
