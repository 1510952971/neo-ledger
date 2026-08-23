"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { fetchClientJson } from "./client-api.ts";
import { passwordStrengthHint } from "./auth-core.js";

export type ClientAuthUser = {
  username: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  provider: "local" | "chatgpt";
};

type AuthStatus = {
  providers: { wechat: boolean; alipay: boolean };
  linkedProviders: Array<"wechat" | "alipay">;
  passwordEnabled: boolean;
  mfaEnabled: boolean;
  recoveryCodesRemaining: number;
  user: { email: string | null } | null;
};

export function AuthPanel({
  user,
  hasUsers,
  onUserChange,
}: {
  user?: ClientAuthUser | null;
  hasUsers: boolean;
  onUserChange?: (user: ClientAuthUser) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">(
    hasUsers ? "login" : "register",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mailerReady, setMailerReady] = useState<boolean | null>(null);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [codeSending, setCodeSending] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [registerEmail, setRegisterEmail] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [resetPasswordHint, setResetPasswordHint] = useState("");
  const [avatarPending, setAvatarPending] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [sessionList, setSessionList] = useState<Array<{ id: string; displayName: string; userAgent: string | null; lastUsedAt: string; current: boolean }>>([]);
  const [passkeys, setPasskeys] = useState<Array<{ id: string; label: string; deviceType: string; backedUp: boolean; createdAt: string; lastUsedAt: string | null }>>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const avatarUrl = user?.avatarUrl ?? null;
  const [status, setStatus] = useState<AuthStatus>({
    providers: { wechat: false, alipay: false },
    linkedProviders: [],
    passwordEnabled: true,
    mfaEnabled: false,
    recoveryCodesRemaining: 0,
    user: user ? { email: user.email ?? null } : null,
  });

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    queueMicrotask(() => {
      setError(query.get("auth_error") ?? "");
      setNotice(query.get("auth_notice") ?? "");
    });
    fetchClientJson<AuthStatus>("/api/auth", { cache: "no-store" })
      .then(({ response, data }) => {
        if (!response.ok || !data) throw new Error("读取账号状态失败");
        return data;
      })
      .then(setStatus)
      .catch(() => undefined);
    fetchClientJson<{ configured?: boolean }>("/api/auth/email-code", { cache: "no-store" })
      .then(({ response, data }) => response.ok && Boolean(data?.configured))
      .then(setMailerReady)
      .catch(() => setMailerReady(false));
  }, []);

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const timer = window.setInterval(
      () => setCodeCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [codeCooldown]);

  useEffect(() => {
    if (!deleteOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const form = deleteFormRef.current;
      const scroller = form?.closest<HTMLElement>(".auth-panel");
      scroller?.scrollTo({
        top: Math.max(0, (form?.offsetTop ?? 0) - 20),
        behavior: "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [deleteOpen]);

  // 三个场景共用一套发码逻辑：注册验证、绑定邮箱、找回密码。
  async function requestCode(purpose: "register" | "bind" | "reset", email: string) {
    if (!email) {
      setError("请先填写邮箱地址");
      return;
    }
    setCodeSending(true);
    setError("");
    setNotice("");
    try {
      const { response, data } = await fetchClientJson<{ error?: string }>("/api/auth/email-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose }),
      });
      if (!response.ok) throw new Error(data?.error || "验证码发送失败");
      setCodeCooldown(60);
      setNotice("验证码已发送，10 分钟内有效，记得看看垃圾邮件箱");
    } catch (codeError) {
      setError(codeError instanceof Error ? codeError.message : "验证码发送失败");
    } finally {
      setCodeSending(false);
    }
  }

  function codeField(purpose: "register" | "bind" | "reset", formId: string) {
    return (
      <label className="auth-code-field">
        <span>邮箱验证码</span>
        <div className="auth-code-row">
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="6 位数字"
          />
          <button
            type="button"
            className="auth-code-send"
            disabled={codeSending || codeCooldown > 0}
            onClick={() => {
              const form = document.getElementById(formId) as HTMLFormElement | null;
              const email = String(
                new FormData(form ?? undefined).get("email") ?? "",
              ).trim();
              void requestCode(purpose, email);
            }}
          >
            {codeCooldown > 0
              ? `${codeCooldown} 秒后重发`
              : codeSending
                ? "发送中…"
                : "获取验证码"}
          </button>
        </div>
      </label>
    );
  }

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      String(form.get("newPassword")) !== String(form.get("newPasswordConfirm"))
    ) {
      setError("两次输入的新密码不一致");
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      const { response, data } = await fetchClientJson<{ error?: string }>("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          code: form.get("code"),
          newPassword: form.get("newPassword"),
        }),
      });
      if (!response.ok) throw new Error(data?.error || "重置密码失败");
      setResetOpen(false);
      setMode("login");
      setNotice("密码已重置，请用新密码登录");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "重置密码失败");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    if (
      mode === "register" &&
      String(form.get("password")) !== String(form.get("passwordConfirm"))
    ) {
      setError("两次输入的密码不一致");
      setPending(false);
      return;
    }
    try {
      const { response, data } = await fetchClientJson<{ error?: string }>("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          username: form.get("username"),
          email: form.get("email"),
          displayName: form.get("displayName"),
          password: form.get("password"),
          code: form.get("code"),
          mfaCode: form.get("mfaCode"),
        }),
      });
      if (!response.ok) throw new Error(data?.error || "登录失败");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败");
    } finally {
      setPending(false);
    }
  }

  async function bindEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    if (
      !status.passwordEnabled &&
      String(form.get("newPassword")) !==
        String(form.get("newPasswordConfirm"))
    ) {
      setError("两次输入的新密码不一致");
      setPending(false);
      return;
    }
    try {
      const { response, data } = await fetchClientJson<{ error?: string; email?: string }>("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          code: form.get("code"),
          currentPassword: form.get("currentPassword"),
          newPassword: form.get("newPassword"),
        }),
      });
      if (!response.ok) throw new Error(data?.error || "绑定邮箱失败");
      setStatus((current) => ({
        ...current,
        passwordEnabled: true,
        user: { email: data?.email ?? null },
      }));
      setNotice(status.user?.email ? "邮箱已更新" : "邮箱绑定成功，现在可以用邮箱登录");
    } catch (bindError) {
      setError(bindError instanceof Error ? bindError.message : "绑定邮箱失败");
    } finally {
      setPending(false);
    }
  }

  async function avatarFromFile(file: File) {
    if (!/^image\/(?:jpeg|png|webp)$/.test(file.type))
      throw new Error("请选择 JPG、PNG 或 WebP 图片");
    if (file.size > 8 * 1024 * 1024)
      throw new Error("原图不能超过 8 MB");
    const image = await createImageBitmap(file);
    try {
      const sourceSize = Math.min(image.width, image.height);
      const sourceX = Math.max(0, (image.width - sourceSize) / 2);
      const sourceY = Math.max(0, (image.height - sourceSize) / 2);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法处理这张图片");
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      return canvas.toDataURL("image/webp", 0.82);
    } finally {
      image.close();
    }
  }

  async function updateAvatar(nextAvatarUrl: string | null) {
    if (!user) return;
    setAvatarPending(true);
    setError("");
    setNotice("");
    try {
      const { response, data } = await fetchClientJson<{ error?: string; avatarUrl?: string | null }>("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: nextAvatarUrl }),
      });
      if (!response.ok) throw new Error(data?.error || "头像更新失败");
      const savedAvatarUrl = data?.avatarUrl ?? null;
      onUserChange?.({ ...user, avatarUrl: savedAvatarUrl });
      setNotice(savedAvatarUrl ? "头像已更新" : "已恢复默认头像");
    } catch (avatarError) {
      setError(
        avatarError instanceof Error ? avatarError.message : "头像更新失败",
      );
    } finally {
      setAvatarPending(false);
    }
  }

  async function selectAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAvatarPending(true);
    setError("");
    try {
      await updateAvatar(await avatarFromFile(file));
    } catch (avatarError) {
      setError(
        avatarError instanceof Error ? avatarError.message : "头像处理失败",
      );
      setAvatarPending(false);
    }
  }

  const oauthButtons = (linking: boolean) => (
    <div className="auth-oauth-grid" aria-label="第三方账号">
      {(["wechat", "alipay"] as const).map((provider) => {
        const name = provider === "wechat" ? "微信" : "支付宝";
        const linked = status.linkedProviders.includes(provider);
        const configured = status.providers[provider];
        if (linked)
          return (
            <button key={provider} type="button" className={`auth-oauth ${provider}`} disabled>
              <span aria-hidden="true">{provider === "wechat" ? "微" : "支"}</span>
              {name}已绑定
            </button>
          );
        if (!configured)
          return (
            <button key={provider} type="button" className={`auth-oauth ${provider}`} disabled>
              <span aria-hidden="true">{provider === "wechat" ? "微" : "支"}</span>
              {name}待配置
            </button>
          );
        return (
          <a
            key={provider}
            className={`auth-oauth ${provider}`}
            href={`/api/auth/oauth?provider=${provider}&return_to=%2F`}
          >
            <span aria-hidden="true">{provider === "wechat" ? "微" : "支"}</span>
            {linking ? `绑定${name}` : `${name}登录`}
          </a>
        );
      })}
    </div>
  );

  async function logout() {
    if (user?.provider === "chatgpt") {
      router.push("/signout-with-chatgpt?return_to=%2F");
      return;
    }
    setPending(true);
    setError("");
    try {
      const { response, data } = await fetchClientJson<{ error?: string }>("/api/auth", { method: "DELETE" });
      if (!response.ok) throw new Error(data?.error || "退出失败");
      router.push("/");
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "退出失败");
      setPending(false);
    }
  }

  async function deleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    setNotice("");
    try {
      const { response, data } = await fetchClientJson<{ error?: string }>("/api/auth?action=delete-account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.get("currentPassword"),
          confirmation: form.get("confirmation"),
        }),
      });
      if (!response.ok) throw new Error(data?.error || "注销账号失败");
      router.push("/");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "注销账号失败");
      setPending(false);
    }
  }

  async function beginMfa() {
    setPending(true);
    setError("");
    try {
      const { response, data } = await fetchClientJson<{ error?: string; secret?: string; uri?: string }>("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "begin" }),
      });
      if (!response.ok || !data?.secret || !data.uri) throw new Error(data?.error || "生成二次验证密钥失败");
      setMfaSetup({ secret: data.secret, uri: data.uri });
      setMfaCode("");
    } catch (mfaError) {
      setError(mfaError instanceof Error ? mfaError.message : "生成二次验证密钥失败");
    } finally {
      setPending(false);
    }
  }

  async function confirmMfa() {
    setPending(true);
    setError("");
    try {
      const { response, data } = await fetchClientJson<{ error?: string; recoveryCodes?: string[]; recoveryCodesRemaining?: number }>("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable", code: mfaCode }),
      });
      if (!response.ok) throw new Error(data?.error || "启用二次验证失败");
      setRecoveryCodes(data?.recoveryCodes ?? []);
      setStatus((current) => ({
        ...current,
        mfaEnabled: true,
        recoveryCodesRemaining: data?.recoveryCodesRemaining ?? 0,
      }));
      setMfaSetup(null);
      setMfaCode("");
      setNotice("二次验证已启用。下次登录需要输入验证器验证码。");
    } catch (mfaError) {
      setError(mfaError instanceof Error ? mfaError.message : "启用二次验证失败");
    } finally {
      setPending(false);
    }
  }

  async function regenerateRecoveryCodes() {
    setPending(true);
    setError("");
    try {
      const { response, data } = await fetchClientJson<{ error?: string; recoveryCodes?: string[]; recoveryCodesRemaining?: number }>("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate-recovery", code: mfaCode }),
      });
      if (!response.ok || !data?.recoveryCodes)
        throw new Error(data?.error || "重新生成恢复码失败");
      const nextRecoveryCodes = data.recoveryCodes;
      setRecoveryCodes(nextRecoveryCodes);
      setStatus((current) => ({
        ...current,
        recoveryCodesRemaining: data.recoveryCodesRemaining ?? nextRecoveryCodes.length,
      }));
      setMfaCode("");
      setNotice("新的恢复码已生成，旧恢复码已全部失效。");
    } catch (mfaError) {
      setError(mfaError instanceof Error ? mfaError.message : "重新生成恢复码失败");
    } finally {
      setPending(false);
    }
  }

  async function copyRecoveryCodes() {
    const text = recoveryCodes.join("\n");
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const input = document.createElement("textarea");
        input.value = text;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.append(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("copy unavailable");
      }
      setNotice("恢复码已复制。");
    } catch {
      setError("浏览器未允许复制，请改用下载文本文件。");
    }
  }

  function downloadRecoveryCodes() {
    const blob = new Blob(
      [`Neo Ledger 二次验证恢复码\n生成时间：${new Date().toLocaleString("zh-CN")}\n\n${recoveryCodes.join("\n")}\n`],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "neo-ledger-mfa-recovery-codes.txt";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function disableMfa() {
    setPending(true);
    setError("");
    try {
      const { response, data } = await fetchClientJson<{ error?: string }>("/api/auth/mfa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: mfaCode }),
      });
      if (!response.ok) throw new Error(data?.error || "关闭二次验证失败");
      setStatus((current) => ({
        ...current,
        mfaEnabled: false,
        recoveryCodesRemaining: 0,
      }));
      setRecoveryCodes([]);
      setMfaCode("");
      setNotice("二次验证已关闭。");
    } catch (mfaError) {
      setError(mfaError instanceof Error ? mfaError.message : "关闭二次验证失败");
    } finally {
      setPending(false);
    }
  }

  async function loadSessions() {
    try {
      const { response, data } = await fetchClientJson<{ sessions?: typeof sessionList }>("/api/security/sessions", { cache: "no-store" });
      if (response.ok) setSessionList(data?.sessions ?? []);
    } catch {
      // Device management is optional UI; the server remains the source of truth.
    }
  }

  async function revokeOtherSessions() {
    setPending(true);
    try {
      const { response, data } = await fetchClientJson<{ error?: string }>("/api/security/sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allExceptCurrent: true }),
      });
      if (!response.ok) throw new Error(data?.error || "注销其他设备失败");
      await loadSessions();
      setNotice("其他设备已注销。");
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "注销其他设备失败");
    } finally {
      setPending(false);
    }
  }

  async function loadPasskeys() {
    try {
      const { response, data } = await fetchClientJson<typeof passkeys>("/api/auth/passkeys", { cache: "no-store" });
      if (response.ok && Array.isArray(data)) setPasskeys(data);
    } catch {
      // The control remains usable for a later retry.
    }
  }

  async function addPasskey() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      if (!window.PublicKeyCredential) throw new Error("当前浏览器不支持 Passkey");
      const { response: begin, data: challengeData } = await fetchClientJson<{ error?: string; challengeId?: string; options?: Parameters<typeof startRegistration>[0]["optionsJSON"] }>("/api/auth/passkeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "begin-registration" }),
      });
      const challenge = challengeData ?? {};
      if (!begin.ok || !challenge.challengeId || !challenge.options)
        throw new Error(challenge.error || "无法开始 Passkey 注册");
      const response = await startRegistration({ optionsJSON: challenge.options });
      const { response: finish, data: resultData } = await fetchClientJson<{ error?: string }>("/api/auth/passkeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish-registration", challengeId: challenge.challengeId, label: "当前设备", response }),
      });
      const result = resultData ?? {};
      if (!finish.ok) throw new Error(result.error || "Passkey 注册失败");
      await loadPasskeys();
      setNotice("Passkey 已添加，可用于免密码登录。");
    } catch (passkeyError) {
      setError(passkeyError instanceof Error ? passkeyError.message : "Passkey 注册失败");
    } finally {
      setPending(false);
    }
  }

  async function removePasskey(id: string) {
    setPending(true);
    setError("");
    try {
      const { response, data: resultData } = await fetchClientJson<{ error?: string }>("/api/auth/passkeys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = resultData ?? {};
      if (!response.ok) throw new Error(result.error || "撤销 Passkey 失败");
      await loadPasskeys();
      setNotice("Passkey 已撤销。");
    } catch (passkeyError) {
      setError(passkeyError instanceof Error ? passkeyError.message : "撤销 Passkey 失败");
    } finally {
      setPending(false);
    }
  }

  async function loginWithPasskey() {
    setPending(true);
    setError("");
    try {
      if (!window.PublicKeyCredential) throw new Error("当前浏览器不支持 Passkey");
      const { response: begin, data: challengeData } = await fetchClientJson<{ error?: string; challengeId?: string; options?: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>("/api/auth/passkeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "begin-authentication" }),
      });
      const challenge = challengeData ?? {};
      if (!begin.ok || !challenge.challengeId || !challenge.options)
        throw new Error(challenge.error || "无法开始 Passkey 登录");
      const response = await startAuthentication({ optionsJSON: challenge.options });
      const { response: finish, data: resultData } = await fetchClientJson<{ error?: string }>("/api/auth/passkeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish-authentication", challengeId: challenge.challengeId, response }),
      });
      const result = resultData ?? {};
      if (!finish.ok) throw new Error(result.error || "Passkey 登录失败");
      router.refresh();
    } catch (passkeyError) {
      setError(passkeyError instanceof Error ? passkeyError.message : "Passkey 登录失败");
      setPending(false);
    }
  }

  if (user)
    return (
      <section className="auth-panel auth-account-panel">
        <div className="auth-avatar-editor">
          <div className="auth-avatar" aria-hidden="true">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt=""
                width={68}
                height={68}
                unoptimized
              />
            ) : (
              user.displayName.slice(0, 1).toUpperCase()
            )}
          </div>
          {user.provider === "local" && (
            <div className="auth-avatar-actions">
              <label className="auth-avatar-upload">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={selectAvatar}
                  disabled={avatarPending}
                />
                <span>{avatarPending ? "处理中…" : "更换头像"}</span>
              </label>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => void updateAvatar(null)}
                  disabled={avatarPending}
                >
                  恢复默认
                </button>
              )}
            </div>
          )}
        </div>
        <p className="eyebrow">ACCOUNT PROFILE</p>
        <h2>{user.displayName}</h2>
        <p className="auth-username">{user.username}</p>
        {user.provider === "local" && (
          <>
            <form className="auth-email-form" id="bind-email-form" onSubmit={bindEmail}>
              <label>
                <span>登录邮箱</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={status.user?.email ?? user.email ?? ""}
                  required
                  placeholder="name@example.com"
                />
              </label>
              {codeField("bind", "bind-email-form")}
              {status.passwordEnabled ? (
                <label>
                  <span>当前密码</span>
                  <input
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    minLength={8}
                    maxLength={72}
                    required
                    placeholder="确认本人操作"
                  />
                </label>
              ) : (
                <>
                  <label>
                    <span>设置邮箱登录密码</span>
                    <input
                      name="newPassword"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={72}
                      required
                      placeholder="至少 8 位"
                    />
                  </label>
                  <label>
                    <span>确认新密码</span>
                    <input
                      name="newPasswordConfirm"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={72}
                      required
                      placeholder="再次输入密码"
                    />
                  </label>
                </>
              )}
              <button className="auth-email-submit" disabled={pending}>
                {status.user?.email ? "更换邮箱" : "绑定邮箱"}
              </button>
              </form>
            <section className="auth-security-section" aria-labelledby="auth-security-title">
              <p className="eyebrow" id="auth-security-title">LOGIN SECURITY</p>
              <h3>{status.mfaEnabled ? "二次验证已开启" : "增强登录安全"}</h3>
              <p>二次验证使用验证器应用生成的一次性验证码，不会把密钥发送给第三方。</p>
              {!status.mfaEnabled && !mfaSetup && (
                <button type="button" onClick={() => void beginMfa()} disabled={pending}>设置验证器二次验证</button>
              )}
              {mfaSetup && (
                <div className="mfa-setup">
                  <p>在 1Password、Microsoft Authenticator 或其他验证器中添加此地址：</p>
                  <code>{mfaSetup.uri}</code>
                  <p>手动密钥：<strong>{mfaSetup.secret}</strong></p>
                  <input value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="输入 6 位验证码" aria-label="二次验证验证码" />
                  <button type="button" onClick={() => void confirmMfa()} disabled={pending || mfaCode.length !== 6}>确认开启</button>
                </div>
              )}
              {status.mfaEnabled && (
                <div className="mfa-disable">
                  <p>可用恢复码：{status.recoveryCodesRemaining} 个</p>
                  <input value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="输入验证码以关闭" aria-label="关闭二次验证验证码" />
                  <button type="button" onClick={() => void regenerateRecoveryCodes()} disabled={pending || mfaCode.length !== 6}>重新生成恢复码</button>
                  <button type="button" onClick={() => void disableMfa()} disabled={pending || mfaCode.length !== 6}>关闭二次验证</button>
                </div>
              )}
              {recoveryCodes.length > 0 && (
                <div className="mfa-recovery" role="status">
                  <strong>恢复码仅显示这一次</strong>
                  <ul>{recoveryCodes.map((code) => <li key={code}><code>{code}</code></li>)}</ul>
                  <div>
                    <button type="button" onClick={() => void copyRecoveryCodes()}>复制恢复码</button>
                    <button type="button" onClick={downloadRecoveryCodes}>下载文本文件</button>
                    <button type="button" onClick={() => setRecoveryCodes([])}>我已保存</button>
                  </div>
                </div>
              )}
              <div className="passkey-management">
                <strong>Passkey</strong>
                <button type="button" onClick={() => void addPasskey()} disabled={pending}>添加当前设备</button>
                <button type="button" onClick={() => void loadPasskeys()} disabled={pending}>刷新列表</button>
                {passkeys.length > 0 && <ul>{passkeys.map((item) => <li key={item.id}><span>{item.label} · {item.backedUp ? "已同步" : "仅此设备"}</span><button type="button" onClick={() => void removePasskey(item.id)} disabled={pending}>撤销</button></li>)}</ul>}
              </div>
              <div className="session-management">
                <button type="button" onClick={() => void loadSessions()}>刷新设备会话</button>
                <button type="button" onClick={() => void revokeOtherSessions()} disabled={pending}>注销其他设备</button>
                {sessionList.length > 0 && <ul>{sessionList.map((item) => <li key={item.id}>{item.current ? "当前设备" : item.displayName} · 最近使用 {new Date(item.lastUsedAt).toLocaleString("zh-CN")}</li>)}</ul>}
              </div>
            </section>
            <div className="auth-divider"><span>第三方账号</span></div>
            {oauthButtons(true)}
          </>
        )}
        {notice && <p className="auth-success">{notice}</p>}
        {error && <p className="auth-error">{error}</p>}
        <button
          type="button"
          className="auth-submit auth-logout"
          onClick={logout}
          disabled={pending}
        >
          退出登录
        </button>
        <>
            <button
              type="button"
              className="auth-delete-toggle"
              onClick={() => {
                setDeleteOpen((open) => !open);
                setError("");
              }}
              disabled={pending}
            >
              {deleteOpen ? "收起注销设置" : "注销账号"}
            </button>
            {deleteOpen && (
              <form
                ref={deleteFormRef}
                className="auth-delete-form"
                onSubmit={deleteAccount}
              >
                <strong>确认注销账号</strong>
                <p>账号和关联财务数据将被删除，当前设备会立即退出。</p>
                {status.passwordEnabled ? (
                  <label>
                    <span>当前密码</span>
                    <input
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      minLength={8}
                      maxLength={72}
                      required
                    />
                  </label>
                ) : (
                  <p>当前账号没有本地密码，将使用当前登录会话确认注销。</p>
                )}
                {status.mfaEnabled && !status.passwordEnabled && (
                  <label>
                    <span>二次验证码</span>
                    <input name="mfaCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required />
                  </label>
                )}
                <label>
                  <span>输入“删除账号”确认</span>
                  <input name="confirmation" required autoComplete="off" />
                </label>
                <button disabled={pending}>
                  {pending ? "处理中…" : "确认注销"}
                </button>
              </form>
            )}
        </>
      </section>
    );

  return (
    <section className="auth-panel">
      <p className="eyebrow">ACCOUNT ACCESS</p>
      <h1>账户号</h1>
      <div className="auth-mode" role="tablist" aria-label="账号操作">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={mode === "login" ? "active" : ""}
          onClick={() => {
            setMode("login");
            setError("");
          }}
        >
          登录
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={mode === "register" ? "active" : ""}
          onClick={() => {
            setMode("register");
            setError("");
          }}
        >
          注册
        </button>
      </div>
      <form onSubmit={submit} className="auth-form" id="auth-main-form">
        {mode === "register" && (
          <label>
            <span>显示名称</span>
            <input
              name="displayName"
              autoComplete="name"
              maxLength={30}
              required
              placeholder="你的名字"
            />
          </label>
        )}
        {mode === "login" && (
          <label>
            <span>二次验证码或恢复码（如已开启）</span>
            <input
              name="mfaCode"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              maxLength={14}
              placeholder={status.mfaEnabled ? "6 位验证码或恢复码" : "未开启可留空"}
            />
          </label>
        )}
        <label>
          <span>{mode === "register" ? "账号" : "账号或邮箱"}</span>
          <input
            name="username"
            autoComplete="username"
            minLength={3}
            maxLength={254}
            required
            placeholder={mode === "register" ? "用户名或 name@example.com" : "账号 / name@example.com"}
            onBlur={(event) => {
              const value = event.currentTarget.value.trim();
              if (mode === "register" && value.includes("@") && !registerEmail)
                setRegisterEmail(value);
            }}
          />
        </label>
        {mode === "register" && (
          <>
            <label>
              <span>邮箱（选填，可用于登录和找回密码）</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                placeholder="name@example.com"
                value={registerEmail}
                onChange={(event) => setRegisterEmail(event.target.value.trim())}
              />
            </label>
            {registerEmail && codeField("register", "auth-main-form")}
          </>
        )}
        <label>
          <span>密码</span>
          <input
            name="password"
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            minLength={8}
            maxLength={72}
            required
            placeholder="至少 8 位"
            onInput={(event) => setPasswordHint(mode === "register" ? passwordStrengthHint(event.currentTarget.value) : "")}
          />
          {mode === "register" && passwordHint && (
            <p className="auth-password-hint" aria-live="polite">{passwordHint}</p>
          )}
        </label>
        {mode === "register" && (
          <label>
            <span>确认密码</span>
            <input
              name="passwordConfirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
              placeholder="再次输入密码"
            />
          </label>
        )}
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-submit" disabled={pending}>
          {pending ? "处理中…" : mode === "register" ? "创建账号" : "登录"}
        </button>
        {mode === "login" && (
          <div className="auth-login-alternatives">
            <button type="button" onClick={() => void loginWithPasskey()} disabled={pending}>使用 Passkey 登录</button>
            <button
              type="button"
              className="auth-forgot"
              onClick={() => {
                setResetOpen(true);
                setError("");
                setNotice("");
              }}
            >
              忘记密码？
            </button>
          </div>
        )}
      </form>
      {resetOpen && (
        <form className="auth-reset-form" id="reset-form" onSubmit={resetPassword}>
          <p className="auth-reset-title">用邮箱重置密码</p>
          <label>
            <span>注册时绑定的邮箱</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              placeholder="name@example.com"
            />
          </label>
          {codeField("reset", "reset-form")}
          <label>
            <span>新密码</span>
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
              placeholder="至少 8 位"
              onInput={(event) => setResetPasswordHint(passwordStrengthHint(event.currentTarget.value))}
            />
            {resetPasswordHint && (
              <p className="auth-password-hint" aria-live="polite">{resetPasswordHint}</p>
            )}
          </label>
          <label>
            <span>确认新密码</span>
            <input
              name="newPasswordConfirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
              placeholder="再次输入新密码"
            />
          </label>
          <div className="auth-reset-actions">
            <button type="button" onClick={() => setResetOpen(false)}>
              取消
            </button>
            <button className="auth-email-submit" disabled={pending}>
              {pending ? "处理中…" : "重置密码"}
            </button>
          </div>
          {mailerReady === false && (
            <p className="auth-reset-hint auth-reset-unavailable">
              当前未配置邮件发送服务，暂时不能通过邮箱重置密码。请配置
              RESEND_API_KEY 和 MAIL_FROM 后重启应用。
            </p>
          )}
        </form>
      )}
      <div className="auth-divider"><span>或使用</span></div>
      {oauthButtons(false)}
      {notice && <p className="auth-success">{notice}</p>}
    </section>
  );
}

export function AuthGate({ hasUsers }: { hasUsers: boolean }) {
  return (
    <main className="auth-gate">
      <div className="auth-gate-brand" aria-hidden="true">
        <span>¥</span>
        <b>NEO LEDGER</b>
      </div>
      <AuthPanel hasUsers={hasUsers} />
    </main>
  );
}
