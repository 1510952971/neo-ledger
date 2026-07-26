const bytesToBase64 = (bytes) => {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(value);
};

const base64ToBytes = (value) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

async function deriveSyncKey(secret, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSyncPayload(value, secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveSyncKey(secret, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return JSON.stringify({
    version: 1,
    algorithm: "AES-256-GCM",
    kdf: "PBKDF2-SHA256-250000",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipher)),
  });
}

export async function decryptSyncPayload(payload, secret) {
  const box = JSON.parse(payload);
  if (
    box?.version !== 1 ||
    box?.algorithm !== "AES-256-GCM" ||
    box?.kdf !== "PBKDF2-SHA256-250000" ||
    typeof box?.salt !== "string" ||
    typeof box?.iv !== "string" ||
    typeof box?.ciphertext !== "string"
  ) {
    throw new Error("无法识别的加密同步文件");
  }
  const key = await deriveSyncKey(secret, base64ToBytes(box.salt));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(box.iv) },
    key,
    base64ToBytes(box.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
