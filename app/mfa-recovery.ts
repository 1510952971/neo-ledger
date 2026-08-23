import { getDbBinding } from "../db";
import {
  createRecoveryCodes,
  isRecoveryCode,
  recoveryCodeHash,
} from "./mfa-recovery-core";

export { createRecoveryCodes, isRecoveryCode, recoveryCodeHash } from "./mfa-recovery-core";

export async function replaceRecoveryCodes(userId: string) {
  const codes = createRecoveryCodes();
  const hashes = await Promise.all(codes.map(recoveryCodeHash));
  const db = getDbBinding();
  await db.batch([
    db.prepare("DELETE FROM user_mfa_recovery_codes WHERE user_id=?").bind(userId),
    ...hashes.map((hash) =>
      db
        .prepare("INSERT INTO user_mfa_recovery_codes(user_id,code_hash) VALUES(?,?)")
        .bind(userId, hash),
    ),
  ]);
  return codes;
}

export async function consumeRecoveryCode(userId: string, value: string) {
  if (!isRecoveryCode(value)) return false;
  const hash = await recoveryCodeHash(value);
  const result = await getDbBinding()
    .prepare(
      `UPDATE user_mfa_recovery_codes
       SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE user_id=? AND code_hash=? AND used_at IS NULL`,
    )
    .bind(userId, hash)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function remainingRecoveryCodes(userId: string) {
  const row = await getDbBinding()
    .prepare(
      "SELECT COUNT(*) count FROM user_mfa_recovery_codes WHERE user_id=? AND used_at IS NULL",
    )
    .bind(userId)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}
