import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeEmail,
  normalizeUsername,
  parseCookieValue,
  SESSION_COOKIE_NAME,
  sessionCookie,
  validateRegistrationInput,
  validateEmail,
} from "../app/auth-core.js";

test("normalizes and validates local wealth-vault accounts", () => {
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
