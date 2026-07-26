import { maskEmail } from "./email-code-core.js";
import { configValue } from "./runtime-env";

// 邮件发送通道。Cloudflare Workers 运行时没有 TCP，发不了传统 SMTP，
// 因此走 Resend 的 HTTP API。未配置密钥时自动降级：验证码打印到运行程序的
// 终端里，本地自用同样能完成全流程，不会阻塞开发。

export function mailerStatus() {
  const apiKey = configValue("RESEND_API_KEY");
  const from = configValue("MAIL_FROM");
  return {
    configured: Boolean(apiKey && from),
    from,
    // 没配好时前端会提示“验证码已输出到终端”，避免用户干等收不到的邮件。
    fallback: !(apiKey && from),
  };
}

export type MailResult = { ok: boolean; fallback: boolean; error?: string };

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<MailResult> {
  const apiKey = configValue("RESEND_API_KEY");
  const from = configValue("MAIL_FROM");
  if (!apiKey || !from) {
    console.log(
      `[邮件未配置] 发往 ${maskEmail(input.to)} 的内容：\n${input.text}`,
    );
    return { ok: true, fallback: true };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      console.error(`[邮件发送失败] ${response.status} ${detail}`);
      return {
        ok: false,
        fallback: false,
        error:
          response.status === 401 || response.status === 403
            ? "邮件服务密钥无效，请检查 RESEND_API_KEY"
            : "邮件发送失败，请稍后再试",
      };
    }
    return { ok: true, fallback: false };
  } catch (error) {
    console.error("[邮件发送异常]", error);
    return { ok: false, fallback: false, error: "邮件服务连接失败" };
  }
}

const PURPOSE_TITLE: Record<string, string> = {
  register: "注册验证",
  bind: "绑定邮箱",
  reset: "重置密码",
};

export function verificationMail(code: string, purpose: string) {
  const title = PURPOSE_TITLE[purpose] ?? "身份验证";
  return {
    subject: `Neo Ledger ${title}验证码：${code}`,
    text: [
      `你正在进行 Neo Ledger ${title}，验证码是：`,
      "",
      code,
      "",
      "验证码 10 分钟内有效，请勿转发给他人。",
      "如果这不是你本人的操作，忽略这封邮件即可，你的账号是安全的。",
    ].join("\n"),
    html: [
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;max-width:460px;margin:0 auto;padding:28px;color:#302d28">',
      `<p style="margin:0 0 6px;font-size:12px;letter-spacing:.12em;color:#876a55">NEO LEDGER</p>`,
      `<h1 style="margin:0 0 18px;font:600 22px Georgia,serif">${title}</h1>`,
      `<p style="margin:0 0 18px;font-size:14px;line-height:1.7">你正在进行 Neo Ledger ${title}，验证码是：</p>`,
      `<p style="margin:0 0 18px;font:700 30px/1 ui-monospace,monospace;letter-spacing:8px;color:#2f4437">${code}</p>`,
      '<p style="margin:0;font-size:12px;line-height:1.8;color:#7b746a">验证码 10 分钟内有效，请勿转发给他人。<br>如果这不是你本人的操作，忽略这封邮件即可。</p>',
      "</div>",
    ].join(""),
  };
}
