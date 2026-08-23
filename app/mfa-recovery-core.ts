const RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const RECOVERY_CODE_COUNT = 10;

function normalizeRecoveryCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

export function isRecoveryCode(value: string) {
  const normalized = normalizeRecoveryCode(value);
  return normalized.length === 12 &&
    [...normalized].every((character) => RECOVERY_ALPHABET.includes(character));
}

export function createRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  const bounded = Math.max(1, Math.min(20, Math.floor(count)));
  const codes = new Set<string>();
  while (codes.size < bounded) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const raw = [...bytes]
      .map((byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length])
      .join("");
    codes.add(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`);
  }
  return [...codes];
}

export async function recoveryCodeHash(value: string) {
  const normalized = normalizeRecoveryCode(value);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`neo-ledger-mfa-recovery:v1:${normalized}`),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
