"use client";

import { useEffect, useState } from "react";

export type ClientAuthUser = {
  username: string;
  displayName: string;
  email?: string | null;
  provider: "local" | "chatgpt";
};

type AuthStatus = {
  providers: { wechat: boolean; alipay: boolean };
  linkedProviders: Array<"wechat" | "alipay">;
  passwordEnabled: boolean;
  user: { email: string | null } | null;
};

export function AuthPanel({
  user,
  hasUsers,
}: {
  user?: ClientAuthUser | null;
  hasUsers: boolean;
}) {
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
  const [status, setStatus] = useState<AuthStatus>({
    providers: { wechat: false, alipay: false },
    linkedProviders: [],
    passwordEnabled: true,
    user: user ? { email: user.email ?? null } : null,
  });

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    queueMicrotask(() => {
      setError(query.get("auth_error") ?? "");
      setNotice(query.get("auth_notice") ?? "");
    });
    fetch("/api/auth", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("读取账号状态失败");
        return (await response.json()) as AuthStatus;
      })
      .then(setStatus)
      .catch(() => undefined);
    fetch("/api/auth/email-code", { cache: "no-store" })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { configured: boolean }).configured
          : false,
      )
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
      const response = await fetch("/api/auth/email-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose }),
      });
      const result = (await response.json()) as {
        error?: string;
        fallback?: boolean;
      };
      if (!response.ok) throw new Error(result.error || "验证码发送失败");
      setCodeCooldown(60);
      setNotice(
        result.fallback
          ? "邮件服务尚未配置，验证码已打印在运行程序的终端窗口里"
          : "验证码已发送，10 分钟内有效，记得看看垃圾邮件箱",
      );
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
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          code: form.get("code"),
          newPassword: form.get("newPassword"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "重置密码失败");
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
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          username: form.get("username"),
          email: form.get("email"),
          displayName: form.get("displayName"),
          password: form.get("password"),
          code: form.get("code"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "登录失败");
      window.location.href = "/";
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
      const response = await fetch("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          code: form.get("code"),
          currentPassword: form.get("currentPassword"),
          newPassword: form.get("newPassword"),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        email?: string;
      };
      if (!response.ok) throw new Error(result.error || "绑定邮箱失败");
      setStatus((current) => ({
        ...current,
        passwordEnabled: true,
        user: { email: result.email ?? null },
      }));
      setNotice(status.user?.email ? "邮箱已更新" : "邮箱绑定成功，现在可以用邮箱登录");
    } catch (bindError) {
      setError(bindError instanceof Error ? bindError.message : "绑定邮箱失败");
    } finally {
      setPending(false);
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
      window.location.href = "/signout-with-chatgpt?return_to=%2F";
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth", { method: "DELETE" });
      if (!response.ok) throw new Error("退出失败");
      window.location.href = "/";
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "退出失败");
      setPending(false);
    }
  }

  if (user)
    return (
      <section className="auth-panel auth-account-panel">
        <div className="auth-avatar" aria-hidden="true">
          {user.displayName.slice(0, 1).toUpperCase()}
        </div>
        <p className="eyebrow">MY WEALTH VAULT</p>
        <h2>{user.displayName}</h2>
        <p className="auth-username">@{user.username}</p>
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
      </section>
    );

  return (
    <section className="auth-panel">
      <p className="eyebrow">MY WEALTH VAULT</p>
      <h1>我的财富仓</h1>
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
        <label>
          <span>{mode === "register" ? "账号" : "账号或邮箱"}</span>
          <input
            name="username"
            autoComplete="username"
            minLength={3}
            maxLength={mode === "register" ? 32 : 254}
            pattern={mode === "register" ? "[A-Za-z0-9][A-Za-z0-9._-]{2,31}" : undefined}
            required
            placeholder={mode === "register" ? "字母或数字账号" : "账号 / name@example.com"}
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
          />
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
          {pending ? "处理中…" : mode === "register" ? "创建财富仓" : "进入财富仓"}
        </button>
        {mode === "login" && (
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
            <p className="auth-reset-hint">
              邮件服务尚未配置，验证码会打印在运行程序的终端窗口里。
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
