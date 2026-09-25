const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const LEASE_MS = 5 * 60 * 1000;

function jsonResponse(body, status, headers = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

async function fingerprint(method, path, body) {
  const bytes = new TextEncoder().encode(`${method}\n${path}\n${body}`);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeReplayHeaders(headers) {
  const replay = {};
  for (const name of [
    "content-type",
    "cache-control",
    "pragma",
    "x-content-type-options",
    "x-request-id",
  ]) {
    const value = headers.get(name);
    if (value != null) replay[name] = value;
  }
  return replay;
}

/**
 * De-duplicates one authenticated JSON API write. The repository stores only
 * the request digest and bounded JSON response; request bodies are never
 * persisted. Auth/session and restore endpoints are intentionally excluded by
 * the caller because they have one-time or bulk-replacement semantics.
 */
export async function runIdempotentMobileWrite({
  request,
  ownerId,
  repository,
  execute,
  now = Date.now(),
}) {
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9._:-]{8,160}$/u.test(key)) return execute();

  const contentType = request.headers.get("content-type") ?? "";
  if (
    request.method === "GET" ||
    (contentType && !contentType.toLowerCase().includes("application/json"))
  ) return execute();

  const body = await request.clone().text();
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) return execute();
  const url = new URL(request.url);
  const requestHash = await fingerprint(
    request.method.toUpperCase(),
    `${url.pathname}${url.search}`,
    body,
  );
  const claim = await repository.claim({
    ownerId,
    key,
    requestHash,
    leaseUntil: now + LEASE_MS,
    now,
  });

  if (claim.kind === "conflict") {
    return jsonResponse(
      { error: "幂等键已用于不同请求", code: "idempotency_conflict" },
      409,
    );
  }
  if (claim.kind === "in_progress") {
    return jsonResponse(
      { error: "相同请求仍在处理中，请稍后重试", code: "idempotency_in_progress" },
      409,
      { "Retry-After": "2" },
    );
  }
  if (claim.kind === "replay") {
    return new Response(claim.body, {
      status: claim.status,
      headers: claim.headers,
    });
  }

  try {
    const response = await execute();
    if (!response.ok) {
      await repository.release({ ownerId, key, requestHash });
      return response;
    }
    const replayBody = await response.clone().text();
    if (new TextEncoder().encode(replayBody).byteLength > MAX_RESPONSE_BYTES) {
      await repository.release({ ownerId, key, requestHash });
      return response;
    }
    await repository.complete({
      ownerId,
      key,
      requestHash,
      status: response.status,
      headers: safeReplayHeaders(response.headers),
      body: replayBody,
    });
    return response;
  } catch (error) {
    await repository.release({ ownerId, key, requestHash });
    throw error;
  }
}

/** Adapter for D1; keys are scoped to the authenticated account. */
export function d1IdempotencyRepository(db) {
  return {
    async claim({ ownerId, key, requestHash, leaseUntil, now }) {
      const inserted = await db
        .prepare(
          "INSERT OR IGNORE INTO mobile_idempotency_responses(owner_id,idempotency_key,request_hash,lease_until) VALUES(?,?,?,?)",
        )
        .bind(ownerId, key, requestHash, leaseUntil)
        .run();
      if (Number(inserted.meta.changes ?? 0) > 0) return { kind: "claimed" };

      let existing = await db
        .prepare(
          "SELECT request_hash AS requestHash,response_status AS status,response_headers AS headers_json,response_body AS body,lease_until AS leaseUntil FROM mobile_idempotency_responses WHERE owner_id=? AND idempotency_key=?",
        )
        .bind(ownerId, key)
        .first();
      if (!existing) return { kind: "in_progress" };
      if (existing.requestHash !== requestHash) return { kind: "conflict" };
      if (existing.status != null) {
        return {
          kind: "replay",
          status: Number(existing.status),
          headers: JSON.parse(existing.headers_json ?? "{}"),
          body: existing.body ?? "",
        };
      }
      if (Number(existing.leaseUntil) > now) return { kind: "in_progress" };

      const reclaimed = await db
        .prepare(
          "UPDATE mobile_idempotency_responses SET lease_until=? WHERE owner_id=? AND idempotency_key=? AND request_hash=? AND response_status IS NULL AND lease_until<=?",
        )
        .bind(leaseUntil, ownerId, key, requestHash, now)
        .run();
      if (Number(reclaimed.meta.changes ?? 0) > 0) return { kind: "claimed" };

      existing = await db
        .prepare(
          "SELECT request_hash AS requestHash,response_status AS status,response_headers AS headers_json,response_body AS body,lease_until AS leaseUntil FROM mobile_idempotency_responses WHERE owner_id=? AND idempotency_key=?",
        )
        .bind(ownerId, key)
        .first();
      if (existing?.requestHash !== requestHash) return { kind: "conflict" };
      if (existing?.status != null) {
        return {
          kind: "replay",
          status: Number(existing.status),
          headers: JSON.parse(existing.headers_json ?? "{}"),
          body: existing.body ?? "",
        };
      }
      return { kind: "in_progress" };
    },
    async complete({ ownerId, key, requestHash, status, headers, body }) {
      await db
        .prepare(
          "UPDATE mobile_idempotency_responses SET response_status=?,response_headers=?,response_body=?,completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE owner_id=? AND idempotency_key=? AND request_hash=? AND response_status IS NULL",
        )
        .bind(status, JSON.stringify(headers), body, ownerId, key, requestHash)
        .run();
    },
    async release({ ownerId, key, requestHash }) {
      await db
        .prepare(
          "DELETE FROM mobile_idempotency_responses WHERE owner_id=? AND idempotency_key=? AND request_hash=? AND response_status IS NULL",
        )
        .bind(ownerId, key, requestHash)
        .run();
    },
  };
}
