const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array) {
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const value of bytes) {
    buffer = (buffer << 8) | value;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) output += ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

export function base32Decode(value: string) {
  const normalized = value.toUpperCase().replaceAll("=", "").replaceAll(" ", "");
  if (!normalized || /[^A-Z2-7]/u.test(normalized)) return null;
  let buffer = 0;
  let bits = 0;
  const output: number[] = [];
  for (const character of normalized) {
    buffer = (buffer << 5) | ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

function constantTimeEqual(left: string, right: string) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1)
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

function counterBytes(counter: number) {
  const bytes = new Uint8Array(new ArrayBuffer(8));
  let value = Math.max(0, Math.floor(counter));
  for (let index = 7; index >= 0; index -= 1) {
    bytes[index] = value % 256;
    value = Math.floor(value / 256);
  }
  return bytes;
}

async function codeFor(secret: Uint8Array, step: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    secret as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes(step) as BufferSource));
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function createTotpSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export function totpUri(secret: string, account: string, issuer = "Neo Ledger") {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function totpCodeAt(secretValue: string, now = Date.now()) {
  const secret = base32Decode(secretValue);
  if (!secret || secret.length < 10) return null;
  return codeFor(secret, Math.floor(now / 1000 / 30));
}

export async function verifyTotp(
  secretValue: string,
  value: string,
  now = Date.now(),
) {
  if (!/^\d{6}$/u.test(value)) return null;
  const secret = base32Decode(secretValue);
  if (!secret || secret.length < 10) return null;
  const currentStep = Math.floor(now / 1000 / 30);
  for (const offset of [-1, 0, 1]) {
    const step = currentStep + offset;
    if (constantTimeEqual(await codeFor(secret, step), value)) return step;
  }
  return null;
}
