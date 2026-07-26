import test from "node:test";
import assert from "node:assert/strict";
import {
  CODE_TTL_MS,
  HOURLY_SEND_LIMIT,
  MAX_ATTEMPTS,
  RESEND_INTERVAL_MS,
  canSendCode,
  codeExpiryFrom,
  generateCode,
  maskEmail,
  normalizeCodeInput,
  normalizeCodePurpose,
  verifyCodeRecord,
} from "../app/email-code-core.js";

test("只接受已知用途，其余一律拒绝", () => {
  assert.equal(normalizeCodePurpose("register"), "register");
  assert.equal(normalizeCodePurpose("bind"), "bind");
  assert.equal(normalizeCodePurpose("reset"), "reset");
  assert.equal(normalizeCodePurpose("delete-everything"), null);
  assert.equal(normalizeCodePurpose(""), null);
  assert.equal(normalizeCodePurpose(undefined), null);
});

test("验证码是 6 位纯数字", () => {
  const code = generateCode(new Uint8Array([12, 3, 250, 7, 99, 100]));
  assert.match(code, /^\d{6}$/);
  assert.equal(code, "230790");
  assert.match(generateCode(), /^\d{6}$/);
});

test("用户输入只保留数字并截断到 6 位", () => {
  assert.equal(normalizeCodeInput(" 12 34-56 "), "123456");
  assert.equal(normalizeCodeInput("1234567890"), "123456");
  assert.equal(normalizeCodeInput("abc"), "");
  assert.equal(normalizeCodeInput(null), "");
});

test("60 秒内不能重复发码，超过后放行", () => {
  const now = 1_000_000;
  const blocked = canSendCode({ lastSentAt: now - 10_000 }, now);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= RESEND_INTERVAL_MS);
  assert.equal(canSendCode({ lastSentAt: now - RESEND_INTERVAL_MS }, now).ok, true);
  assert.equal(canSendCode({}, now).ok, true);
});

test("一小时内超过上限直接拒绝，防止拿来骚扰他人邮箱", () => {
  const now = 1_000_000;
  const result = canSendCode(
    { lastSentAt: now - 10 * 60 * 1000, sentWithinHour: HOURLY_SEND_LIMIT },
    now,
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /一小时/);
  assert.equal(
    canSendCode({ sentWithinHour: HOURLY_SEND_LIMIT - 1 }, now).ok,
    true,
  );
});

test("校验：正确、错误、过期、用尽次数、已使用", () => {
  const now = 2_000_000;
  const record = {
    codeHash: "hash-abc",
    expiresAt: now + 60_000,
    attempts: 0,
    consumedAt: null,
  };
  assert.equal(verifyCodeRecord(record, "hash-abc", now).ok, true);

  const wrong = verifyCodeRecord(record, "hash-xyz", now);
  assert.equal(wrong.ok, false);
  assert.match(wrong.reason, /不正确/);

  const expired = verifyCodeRecord({ ...record, expiresAt: now - 1 }, "hash-abc", now);
  assert.equal(expired.ok, false);
  assert.match(expired.reason, /过期/);

  const exhausted = verifyCodeRecord(
    { ...record, attempts: MAX_ATTEMPTS },
    "hash-abc",
    now,
  );
  assert.equal(exhausted.ok, false);
  assert.match(exhausted.reason, /次数过多/);

  const consumed = verifyCodeRecord({ ...record, consumedAt: now - 1 }, "hash-abc", now);
  assert.equal(consumed.ok, false);
  assert.match(consumed.reason, /已使用/);

  assert.equal(verifyCodeRecord(null, "hash-abc", now).ok, false);
  assert.equal(verifyCodeRecord(record, "", now).ok, false);
});

test("有效期为 10 分钟", () => {
  const now = 5_000_000;
  assert.equal(codeExpiryFrom(now) - now, CODE_TTL_MS);
  assert.equal(CODE_TTL_MS, 600_000);
});

test("邮箱脱敏保留首尾字符与域名", () => {
  assert.equal(maskEmail("pengguofu@qq.com"), "p*******u@qq.com");
  assert.equal(maskEmail("ab@qq.com"), "a*@qq.com");
  assert.equal(maskEmail("a@qq.com"), "a*@qq.com");
  assert.equal(maskEmail("not-an-email"), "not-an-email");
});
