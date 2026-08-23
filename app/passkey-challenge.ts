import { ensureDb, getDbBinding } from "../db";

export type PasskeyChallengePurpose = "registration" | "authentication";

export async function storePasskeyChallenge(input: { userId?: string | null; purpose: PasskeyChallengePurpose; challenge: string; now?: number }) {
  await ensureDb();
  const now = input.now ?? Date.now();
  const id = crypto.randomUUID();
  const db = getDbBinding();
  await db.batch([
    db.prepare("DELETE FROM webauthn_challenges WHERE expires_at<=?").bind(now),
    db.prepare("INSERT INTO webauthn_challenges(id,user_id,purpose,challenge,expires_at) VALUES(?,?,?,?,?)").bind(id, input.userId ?? null, input.purpose, input.challenge, now + 5 * 60_000),
  ]);
  return id;
}

export async function consumePasskeyChallenge(input: { id: string; userId?: string | null; purpose: PasskeyChallengePurpose; now?: number }) {
  await ensureDb();
  const row = await getDbBinding()
    .prepare("DELETE FROM webauthn_challenges WHERE id=? AND purpose=? AND COALESCE(user_id,'')=COALESCE(?,'') RETURNING challenge,expires_at expiresAt")
    .bind(input.id, input.purpose, input.userId ?? null)
    .first<{ challenge: string; expiresAt: number }>();
  if (!row || row.expiresAt <= (input.now ?? Date.now())) return null;
  return row.challenge;
}
