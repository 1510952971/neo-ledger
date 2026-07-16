import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../../db";
import { claimLedgerForOwner } from "../../../../api-security";
import { localDateTimeToUtc } from "../../../../time-money.js";

const tokenOk = (request: Request) => {
  const expected = String(
    (env as unknown as Record<string, unknown>).SYNC_TOKEN || "",
  );
  const got =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    request.headers.get("x-sync-token") ||
    "";
  return Boolean(expected && got === expected);
};
const clean = (value: string) =>
  value
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
export async function POST(request: Request) {
  try {
    if (!tokenOk(request))
      return NextResponse.json({ error: "SYNC_TOKEN 无效" }, { status: 401 });
    await ensureDb();
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, unknown> = {};
    if (contentType.includes("application/json"))
      body = (await request.json()) as Record<string, unknown>;
    else body = Object.fromEntries(new URLSearchParams(await request.text()));
    const raw = clean(
      String(
        body.text ||
          body.body ||
          body.message ||
          body.content ||
          body.title ||
          "",
      ),
    );
    const ledgerId = Number(body.ledgerId || 1);
    const timezone = String(body.timezone || "Asia/Shanghai");
    const integrationOwner = String(
      (env as unknown as Record<string, unknown>).SYNC_OWNER_ID || "local",
    );
    await claimLedgerForOwner(integrationOwner, ledgerId);
    if (!raw) throw new Error("通知文本为空");
    const amountHit =
      raw.match(/(?:人民币|CNY|RMB|¥|￥)\s*([0-9,]+(?:\.\d{1,2})?)\s*元?/i) ||
      raw.match(
        /(?:消费|支出|扣款|交易|支付|入账|收入)[^0-9]{0,10}([0-9,]+\.\d{1,2})\s*元?/i,
      );
    if (!amountHit) throw new Error("未识别到明确金额");
    const amount = Math.round(Number(amountHit[1].replaceAll(",", "")) * 100);
    if (!amount || amount > 10000000000) throw new Error("金额超出有效范围");
    const now = new Date(),
      dateHit = raw.match(
        /(?:(20\d{2})[-/年])?(\d{1,2})[-/月](\d{1,2})日?\s*(\d{1,2}):(\d{2})/,
      );
    const occurredAt = dateHit
      ? localDateTimeToUtc(`${dateHit[1] || now.getFullYear()}-${dateHit[2].padStart(2, "0")}-${dateHit[3].padStart(2, "0")} ${dateHit[4].padStart(2, "0")}:${dateHit[5]}:00`, timezone)
      : now.toISOString();
    const type =
        /入账|收入|到账|退款/.test(raw) && !/消费|支出|扣款/.test(raw)
          ? "收入"
          : "支出",
      db = getDbBinding();
    const accounts = await db
      .prepare(
        "SELECT id,name,currency FROM accounts WHERE ledger_id=? ORDER BY id",
      )
      .bind(ledgerId)
      .all<{ id: number; name: string; currency: string }>();
    const bankWord =
      raw.match(/【([^】]+)】/)?.[1] ||
      raw.match(/(招商|建设|工商|农业|中国|交通|支付宝|微信)/)?.[1] ||
      "";
    const account =
      accounts.results.find(
        (item) =>
          raw.includes(item.name) ||
          item.name.includes(bankWord) ||
          bankWord.includes(item.name.replace(/银行|卡|账户/g, "")),
      ) ?? accounts.results[0];
    if (!account) throw new Error("账本中没有可匹配账户");
    const duplicate = await db
      .prepare(
        "SELECT id FROM pending_transactions WHERE ledger_id=? AND raw_text=? AND created_at>=datetime('now','-10 minutes')",
      )
      .bind(ledgerId, raw)
      .first<{ id: number }>();
    if (duplicate)
      return NextResponse.json({ ok: true, duplicate: true, id: duplicate.id });
    const title =
      (bankWord ? `${bankWord}通知` : "手机通知") +
      ` · ${
        raw
          .match(/(?:商户|于)([^，。]{2,24})(?:消费|支出|扣款|支付)/)?.[1]
          ?.replace(/账户\d+/g, "")
          .trim() || "待确认交易"
      }`;
    const result = await db
      .prepare(
        "INSERT INTO pending_transactions(ledger_id,raw_text,title,amount,type,account_id,currency,occurred_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        ledgerId,
        raw,
        title.slice(0, 40),
        amount,
        type,
        account.id,
        account.currency,
        occurredAt,
      )
      .run();
    await db.batch([
      db
        .prepare(
          "UPDATE accounts SET current_balance=current_balance+? WHERE id=?",
        )
        .bind(type === "支出" ? -amount : amount, account.id),
      db
        .prepare(
          "INSERT INTO system_notifications(ledger_id,title,message) VALUES (?,'收到一笔自动流水',?)",
        )
        .bind(
          ledgerId,
          `${account.name} ${type} ${account.currency} ${(amount / 100).toFixed(2)}，等待分类确认`,
        ),
    ]);
    return NextResponse.json(
      {
        ok: true,
        id: Number(result.meta.last_row_id),
        status: "待确认",
        parsed: {
          amount: amount / 100,
          type,
          account: account.name,
          occurredAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "自动解析失败" },
      { status: 400 },
    );
  }
}
