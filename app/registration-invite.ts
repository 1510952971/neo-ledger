import { createHash } from "node:crypto";
import { getDbBinding } from "../db";
import { validateEmail } from "./auth-core.js";
import { configValue } from "./runtime-env";

const MIN_INVITE_LENGTH = 32;
const MAX_INVITE_LENGTH = 128;
const INVITE_PATTERN = /^[A-Za-z0-9_-]+$/;

export function normalizeRegistrationInvite(value: unknown) {
  const code = String(value ?? "").trim();
  if (
    code.length < MIN_INVITE_LENGTH ||
    code.length > MAX_INVITE_LENGTH ||
    !INVITE_PATTERN.test(code)
  )
    return null;
  return code;
}

export function registrationInviteHash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Allows one explicitly configured invite to create the first account only. */
export async function ensureBootstrapRegistrationInvite() {
  const code = normalizeRegistrationInvite(
    configValue("NEO_REGISTRATION_BOOTSTRAP_CODE"),
  );
  if (!code) return;
  let targetEmail: string;
  try {
    const email = validateEmail(configValue("NEO_REGISTRATION_BOOTSTRAP_EMAIL"));
    if (!email) return;
    targetEmail = email;
  } catch {
    return;
  }
  const db = getDbBinding();
  const existingUser = await db
    .prepare("SELECT 1 AS present FROM app_users WHERE disabled=0 LIMIT 1")
    .first();
  if (existingUser) return;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await db
    .prepare("INSERT OR IGNORE INTO registration_invites(code_hash,created_by,target_email,expires_at) VALUES(?,'bootstrap',?,?)")
    .bind(registrationInviteHash(code), targetEmail, expiresAt)
    .run();
}
