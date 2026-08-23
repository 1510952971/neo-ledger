import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { ensureDb, getDbBinding } from "../db";
import { passkeyRequestContext } from "./passkey-context";
import {
  passkeyBase64UrlToBytes,
  passkeyBytesToBase64Url,
} from "./passkey-encoding";

const RP_NAME = "Neo Ledger";
export const PASSKEY_LIMIT = 50;

type StoredPasskey = {
  id: string;
  userId: string;
  label: string;
  publicKey: string;
  counter: number;
  deviceType: string;
  backedUp: number;
  transports: string;
  createdAt: string;
  lastUsedAt: string | null;
};

function storedTransports(value: string): AuthenticatorTransportFuture[] {
  const allowed = new Set<AuthenticatorTransportFuture>([
    "ble",
    "cable",
    "hybrid",
    "internal",
    "nfc",
    "smart-card",
    "usb",
  ]);
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is string => typeof item === "string" && allowed.has(item as AuthenticatorTransportFuture))
          .slice(0, 8) as AuthenticatorTransportFuture[]
      : [];
  } catch {
    // A damaged metadata row must not turn into an unhandled 500 or widen the
    // verifier input. The credential remains usable without transport hints.
    return [];
  }
}

export async function registrationOptions(user: { id: string; username: string; displayName: string }, request: Request) {
  await ensureDb();
  const { rpID } = passkeyRequestContext(request);
  const existing = await getDbBinding()
    .prepare("SELECT id,transports FROM user_passkeys WHERE user_id=? ORDER BY created_at,id LIMIT ?")
    .bind(user.id, PASSKEY_LIMIT)
    .all<{ id: string; transports: string }>();
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.username,
    userDisplayName: user.displayName,
    attestationType: "none",
    excludeCredentials: existing.results.map((item) => ({
      id: item.id,
      transports: storedTransports(item.transports),
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });
}

export async function registerPasskey(input: {
  userId: string;
  label: string;
  challenge: string;
  response: RegistrationResponseJSON;
  request: Request;
}) {
  await ensureDb();
  const count = await getDbBinding()
    .prepare("SELECT COUNT(*) count FROM user_passkeys WHERE user_id=?")
    .bind(input.userId)
    .first<{ count: number }>();
  if (Number(count?.count ?? 0) >= PASSKEY_LIMIT)
    throw new Error(`Passkey 最多 ${PASSKEY_LIMIT} 个`);
  const context = passkeyRequestContext(input.request);
  const result = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin: context.origin,
    expectedRPID: context.rpID,
    requireUserVerification: true,
  });
  if (!result.verified || !result.registrationInfo)
    throw new Error("Passkey 注册验证失败");
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  const inserted = await getDbBinding()
    .prepare(
      `INSERT OR IGNORE INTO user_passkeys
       (id,user_id,label,public_key,counter,device_type,backed_up,transports)
       VALUES(?,?,?,?,?,?,?,?)`,
    )
    .bind(
      credential.id,
      input.userId,
      input.label.trim().slice(0, 60) || "Passkey",
      passkeyBytesToBase64Url(credential.publicKey),
      credential.counter,
      credentialDeviceType,
      credentialBackedUp ? 1 : 0,
      JSON.stringify(credential.transports ?? []),
    )
    .run();
  if (!inserted.meta.changes) throw new Error("这个 Passkey 已经注册");
  return credential.id;
}

export async function authenticationOptions(request: Request) {
  const { rpID } = passkeyRequestContext(request);
  return generateAuthenticationOptions({ rpID, userVerification: "required" });
}

async function storedPasskey(id: string) {
  await ensureDb();
  return getDbBinding()
    .prepare(
      `SELECT p.id,p.user_id userId,p.label,p.public_key publicKey,p.counter,p.device_type deviceType,
              p.backed_up backedUp,p.transports,p.created_at createdAt,p.last_used_at lastUsedAt
       FROM user_passkeys p
       JOIN app_users u ON u.id=p.user_id AND u.disabled=0
       WHERE p.id=?`,
    )
    .bind(id)
    .first<StoredPasskey>();
}

export async function authenticatePasskey(input: {
  challenge: string;
  response: AuthenticationResponseJSON;
  request: Request;
}) {
  const passkey = await storedPasskey(input.response.id);
  if (!passkey) throw new Error("Passkey 不存在或已被撤销");
  const context = passkeyRequestContext(input.request);
  const result = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: input.challenge,
    expectedOrigin: context.origin,
    expectedRPID: context.rpID,
    credential: {
      id: passkey.id,
      publicKey: passkeyBase64UrlToBytes(passkey.publicKey),
      counter: passkey.counter,
      transports: storedTransports(passkey.transports),
    },
    requireUserVerification: true,
  });
  if (!result.verified) throw new Error("Passkey 登录验证失败");
  const updated = await getDbBinding()
    .prepare(
      `UPDATE user_passkeys SET counter=?,last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id=? AND counter=?`,
    )
    .bind(result.authenticationInfo.newCounter, passkey.id, passkey.counter)
    .run();
  if (!updated.meta.changes) throw new Error("Passkey 状态已变化，请重试");
  return { userId: passkey.userId, credentialId: passkey.id };
}

export async function listPasskeys(userId: string) {
  await ensureDb();
  const rows = await getDbBinding()
    .prepare(
      `SELECT id,label,device_type deviceType,backed_up backedUp,created_at createdAt,last_used_at lastUsedAt
       FROM user_passkeys WHERE user_id=? ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(userId, PASSKEY_LIMIT)
    .all<{ id: string; label: string; deviceType: string; backedUp: number; createdAt: string; lastUsedAt: string | null }>();
  return rows.results.map((row) => ({ ...row, backedUp: Boolean(row.backedUp) }));
}
