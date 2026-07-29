import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";

const bytesToBase64 = (bytes) => {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(value);
};

const base64ToBytes = (value) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const hasWebCrypto = () => Boolean(globalThis.crypto?.subtle);

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  if (!globalThis.crypto?.getRandomValues)
    throw new Error("当前浏览器不支持安全随机数，请升级浏览器后重试");
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

async function deriveSyncKey(secret, salt) {
  if (!hasWebCrypto())
    return pbkdf2Async(sha256, new TextEncoder().encode(secret), salt, {
      c: 250000,
      dkLen: 32,
      asyncTick: 1,
    });
  const material = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return globalThis.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSyncPayload(value, secret) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveSyncKey(secret, salt);
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = hasWebCrypto()
    ? new Uint8Array(
        await globalThis.crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          key,
          plain,
        ),
      )
    : gcm(key, iv).encrypt(plain);
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
  const iv = base64ToBytes(box.iv);
  const ciphertext = base64ToBytes(box.ciphertext);
  const plain = hasWebCrypto()
    ? await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext,
      )
    : gcm(key, iv).decrypt(ciphertext);
  return JSON.parse(new TextDecoder().decode(plain));
}
