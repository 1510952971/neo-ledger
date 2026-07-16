import { NextResponse } from "next/server";
import { getDbBinding } from "../../../db";
import {
  accessErrorResponse,
  getOwnerPreferences,
  requestOwnerId,
} from "../../api-security";

const themes = ["cream", "obsidian", "glacier", "peach"];
const PIN_ITERATIONS = 120_000;

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  return new Uint8Array(hex.match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)) ?? []);
}

async function derivePin(pin: string, salt: Uint8Array, iterations: number) {
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

function validPin(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

export async function GET(request: Request) {
  try {
    const row = await getOwnerPreferences(requestOwnerId(request));
    return NextResponse.json({
      theme: row?.theme ?? "cream",
      lockEnabled: Boolean(row?.lockEnabled),
    });
  } catch (error) {
    return accessErrorResponse(error, "读取设置失败");
  }
}

export async function PATCH(request: Request) {
  try {
    const ownerId = requestOwnerId(request);
    await getOwnerPreferences(ownerId);
    const body = (await request.json()) as {
      theme?: string;
      enabled?: boolean;
      pin?: string;
    };
    const db = getDbBinding();
    if (body.theme) {
      if (!themes.includes(body.theme)) throw new Error("主题不存在");
      await db
        .prepare(
          "UPDATE user_preferences SET theme=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE owner_id=?",
        )
        .bind(body.theme, ownerId)
        .run();
    }
    if (typeof body.enabled === "boolean") {
      if (body.enabled && !validPin(body.pin)) throw new Error("请输入4位数字PIN");
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
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "设置失败");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pin?: string };
    if (!validPin(body.pin)) return NextResponse.json({ ok: false }, { status: 400 });
    const row = await getOwnerPreferences(requestOwnerId(request));
    if (!row?.lockEnabled || !row.pinHash || !row.pinSalt)
      return NextResponse.json({ ok: false }, { status: 401 });
    const hash = await derivePin(
      body.pin,
      hexToBytes(row.pinSalt),
      row.pinIterations || PIN_ITERATIONS,
    );
    const ok = hash === row.pinHash;
    return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
  } catch (error) {
    return accessErrorResponse(error, "验证失败");
  }
}
