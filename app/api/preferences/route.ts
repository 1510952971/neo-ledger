import { NextResponse } from "next/server";
import { getDbBinding } from "../../../db";
import {
  ApiAccessError,
  accessErrorResponse,
  getOwnerPreferences,
  requestOwnerId,
} from "../../api-security";
import { readPinInput, readPreferencesPatchInput } from "../../internal-api-contract";

const PIN_ITERATIONS = 120_000;

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  return new Uint8Array(hex.match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)) ?? []);
}

async function derivePin(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1)
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

async function enforcePinAttempts(ownerId: string) {
  const db = getDbBinding();
  const windowDurationMs = 15 * 60 * 1_000;
  const now = Date.now();
  const windowStart = Math.floor(now / windowDurationMs);
  await db
    .prepare(
      `INSERT INTO api_rate_limits(owner_id,scope,window_start,count)
       VALUES(?,?,?,1)
       ON CONFLICT(owner_id,scope,window_start) DO UPDATE SET count=count+1`,
    )
    .bind(`pin:${ownerId}`, "privacy-pin", windowStart)
    .run();
  const row = await db
    .prepare(
      "SELECT count FROM api_rate_limits WHERE owner_id=? AND scope=? AND window_start=?",
    )
    .bind(`pin:${ownerId}`, "privacy-pin", windowStart)
    .first<{ count: number }>();
  if (Number(row?.count ?? 0) > 5) {
    const retryAfter = Math.max(1, Math.ceil(((windowStart + 1) * windowDurationMs - now) / 1_000));
    throw new ApiAccessError("安全码尝试次数过多，请 15 分钟后再试", 429, retryAfter);
  }
}

export async function GET(request: Request) {
  try {
    const row = await getOwnerPreferences(await requestOwnerId(request));
    return privateJson({
      theme: row?.theme ?? "cream",
      lockEnabled: Boolean(row?.lockEnabled),
    });
  } catch (error) {
    return accessErrorResponse(error, "读取设置失败", request);
  }
}

export async function PATCH(request: Request) {
  try {
    const ownerId = await requestOwnerId(request);
    await getOwnerPreferences(ownerId);
    const body = await readPreferencesPatchInput(request);
    const db = getDbBinding();
    if (body.theme) {
      await db
        .prepare(
          "UPDATE user_preferences SET theme=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE owner_id=?",
        )
        .bind(body.theme, ownerId)
        .run();
    }
    if (typeof body.enabled === "boolean") {
      const salt = body.enabled ? crypto.getRandomValues(new Uint8Array(16)) : null;
      const hash = body.enabled
        ? await derivePin(body.pin!, salt!, PIN_ITERATIONS)
        : null;
      await db
        .prepare(
          "UPDATE user_preferences SET lock_enabled=?,pin_hash=?,pin_salt=?,pin_iterations=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE owner_id=?",
        )
        .bind(
          body.enabled ? 1 : 0,
          hash,
          salt ? bytesToHex(salt) : null,
          PIN_ITERATIONS,
          ownerId,
        )
        .run();
    }
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "设置失败", request);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readPinInput(request);
    const ownerId = await requestOwnerId(request);
    await enforcePinAttempts(ownerId);
    const row = await getOwnerPreferences(ownerId);
    if (!row?.lockEnabled || !row.pinHash || !row.pinSalt)
      return privateJson({ ok: false }, { status: 401 });
    const hash = await derivePin(
      body.pin,
      hexToBytes(row.pinSalt),
      row.pinIterations || PIN_ITERATIONS,
    );
    const ok = constantTimeEqual(hash, row.pinHash);
    return privateJson({ ok }, { status: ok ? 200 : 401 });
  } catch (error) {
    return accessErrorResponse(error, "验证失败", request);
  }
}
