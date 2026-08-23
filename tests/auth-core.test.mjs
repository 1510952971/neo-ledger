import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeEmail,
  normalizeUsername,
  passwordStrengthHint,
  parseCookieValue,
  SESSION_COOKIE_NAME,
  sessionCookie,
  validateRegistrationInput,
  validateEmail,
} from "../app/auth-core.js";
import {
  PASSWORD_DENYLIST_ENTRIES,
  PASSWORD_DENYLIST,
  PASSWORD_DENYLIST_SIZE,
  PASSWORD_DENYLIST_VERSION,
} from "../app/password-denylist.js";

test("normalizes and validates local accounts", () => {
  assert.equal(normalizeUsername("  Peng.User  "), "peng.user");
  assert.deepEqual(
    validateRegistrationInput({
      username: "Peng.User",
      displayName: "小猫",
      password: "correct-horse",
    }),
    {
      username: "peng.user",
      displayName: "小猫",
      password: "correct-horse",
      email: null,
    },
  );
});

test("normalizes email addresses and accepts them during registration", () => {
  assert.equal(normalizeEmail("  Peng@Example.COM "), "peng@example.com");
  assert.equal(validateEmail("Peng@Example.COM"), "peng@example.com");
  assert.equal(validateEmail("", { optional: true }), null);
  assert.equal(
    validateRegistrationInput({
      username: "peng.user",
      displayName: "用户",
      password: "correct-horse",
      email: "Peng@Example.COM",
    }).email,
    "peng@example.com",
  );
  assert.throws(() => validateEmail("not-an-email"), /有效的邮箱/);
});

test("accepts a verified email address as the account name", () => {
  assert.deepEqual(
    validateRegistrationInput({
      username: "User@Gmail.COM",
      displayName: "用户",
      password: "correct-horse",
      email: "user@gmail.com",
    }),
    {
      username: "user@gmail.com",
      displayName: "用户",
      password: "correct-horse",
      email: "user@gmail.com",
    },
  );
  assert.throws(
    () =>
      validateRegistrationInput({
        username: "user@gmail.com",
        displayName: "用户",
        password: "correct-horse",
        email: "other@gmail.com",
      }),
    /验证邮箱一致/,
  );
});

test("rejects weak or ambiguous account input", () => {
  assert.throws(
    () =>
      validateRegistrationInput({
        username: "ab",
        displayName: "用户",
        password: "12345678",
      }),
    /3—32/,
  );
  assert.throws(
    () =>
      validateRegistrationInput({
        username: "valid_user",
        displayName: "用户",
        password: "short",
      }),
    /8—72/,
  );
  for (const password of ["12345678", "password123", "aaaaaaaa", "0123456789", "9876543210"]) {
    assert.throws(
      () =>
        validateRegistrationInput({
          username: "valid_user",
          displayName: "用户",
          password,
        }),
      /密码过于常见/,
    );
  }
});

test("provides client-safe password strength feedback", () => {
  assert.equal(passwordStrengthHint(""), "");
  assert.equal(passwordStrengthHint("short"), "至少 8 位");
  assert.match(passwordStrengthHint("12345678"), /常见或可预测/);
  assert.equal(passwordStrengthHint("correct-horse"), "密码强度：可用");
  assert.equal(passwordStrengthHint("Correct-horse!2026"), "密码强度：较强");
});

test("uses a versioned offline password denylist", () => {
  assert.match(PASSWORD_DENYLIST_VERSION, /^20\d\d-\d\d-[a-z0-9-]+$/u);
  assert.equal(PASSWORD_DENYLIST_SIZE, PASSWORD_DENYLIST.size);
  assert.equal(PASSWORD_DENYLIST_SIZE, PASSWORD_DENYLIST_ENTRIES.length);
  assert.ok(PASSWORD_DENYLIST_SIZE >= 50);
  for (const password of ["administrator", "welcome123", "qwertyui", "5201314520", "管理员管理员管理员"]) {
    assert.throws(
      () => validateRegistrationInput({ username: "denylist_user", displayName: "用户", password }),
      /密码过于常见/,
    );
  }
  assert.doesNotThrow(() => validateRegistrationInput({
    username: "denylist_user",
    displayName: "用户",
    password: "Correct-horse!2026",
  }));
});

test("session cookies are HttpOnly, scoped and removable", () => {
  const token = "nls_example-session-token";
  const active = sessionCookie(token, { secure: true, maxAge: 3600 });
  assert.match(active, new RegExp(`^${SESSION_COOKIE_NAME}=`));
  assert.match(active, /HttpOnly/);
  assert.match(active, /SameSite=Lax/);
  assert.match(active, /Secure/);
  assert.equal(
    parseCookieValue(`theme=cream; ${active}`, SESSION_COOKIE_NAME),
    token,
  );
  assert.match(sessionCookie("", { maxAge: 0 }), /Max-Age=0/);
});
