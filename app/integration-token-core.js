const TOKEN_PREFIX = "nls_";

function bytesToHex(bytes) {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashIntegrationToken(token) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return bytesToHex(new Uint8Array(digest));
}

export function createIntegrationToken(randomBytes) {
  const bytes = randomBytes ?? crypto.getRandomValues(new Uint8Array(24));
  const secret = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `${TOKEN_PREFIX}${secret}`;
}
