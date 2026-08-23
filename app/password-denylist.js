/**
 * Versioned offline password denylist.
 *
 * Keep this file small, reviewable and replaceable. It is intentionally a
 * curated set of passwords that are both common and routinely present in
 * credential-stuffing lists; it is not a complete breach corpus.
 */
export const PASSWORD_DENYLIST_VERSION = "2026-08-curated-1";

export const PASSWORD_DENYLIST_ENTRIES = [
  "password", "password1", "password123", "passw0rd", "p@ssword", "p@ssw0rd",
  "12345678", "123456789", "1234567890", "987654321", "5201314520", "88888888",
  "66666666", "12121212", "11223344", "qwertyui", "qwerty123", "1q2w3e4r",
  "123qwe456", "asdfghjk", "zxcvbnm1", "abc12345", "letmein1", "letmein123",
  "welcome1", "welcome123", "admin123", "administrator", "root12345", "user12345",
  "guest1234", "default1", "changeme1", "secret123", "test12345", "login123",
  "access123", "master123", "iloveyou", "sunshine", "whatever", "trustno1",
  "freedom123", "hello123", "shadow123", "superman", "princess1", "dragon123",
  "monkey123", "football", "baseball", "soccer123", "hockey123", "michael1",
  "jordan23", "harley123", "batman123", "starwars", "matrix123", "summer2024",
  "winter2024", "spring2024", "autumn2024", "computer1", "密码密码密码密码", "管理员管理员管理员",
];

export const PASSWORD_DENYLIST = new Set(PASSWORD_DENYLIST_ENTRIES);

export const PASSWORD_DENYLIST_SIZE = PASSWORD_DENYLIST.size;
