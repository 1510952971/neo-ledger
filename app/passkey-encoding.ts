/** Web-standard Base64URL helpers shared by the Worker and browser-safe tests. */
export function passkeyBytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

export function passkeyBase64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]*$/u.test(value) || value.length % 4 === 1)
    throw new Error("Passkey 公钥编码无效");
  const padded =
    value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("Passkey 公钥编码无效");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
