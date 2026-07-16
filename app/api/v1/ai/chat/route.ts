import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../../../api-security";

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
        ledgerId?: number;
        message?: string;
      },
      ledgerId = Number(body.ledgerId || 1),
      message = String(body.message || "")
        .trim()
        .slice(0, 1000);
    if (!message) throw new Error("请先输入问题");
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding(),
      [wealth, category, mood] = await Promise.all([
        db
          .prepare(
            "SELECT COALESCE(SUM(CASE WHEN type='资产' THEN current_balance ELSE -ABS(current_balance) END)*(CASE currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN .0462 WHEN 'EUR' THEN 7.85 ELSE 1 END),0) netWorth,COALESCE(SUM(CASE WHEN type='资产' THEN current_balance*(CASE currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN .0462 WHEN 'EUR' THEN 7.85 ELSE 1 END) ELSE 0 END),0) assets,COALESCE(SUM(CASE WHEN type='负债' THEN ABS(current_balance)*(CASE currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN .0462 WHEN 'EUR' THEN 7.85 ELSE 1 END) ELSE 0 END),0) liabilities FROM accounts WHERE ledger_id=?",
          )
          .bind(ledgerId)
          .first<{ netWorth: number; assets: number; liabilities: number }>(),
        db
          .prepare(
            "SELECT COALESCE(category_dynamic,category,'未分类') category,SUM(amount*(CASE currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN .0462 WHEN 'EUR' THEN 7.85 ELSE 1 END)) amount FROM transactions WHERE ledger_id=? AND type='支出' AND strftime('%Y-%m',occurred_at)=strftime('%Y-%m','now') GROUP BY COALESCE(category_dynamic,category,'未分类') ORDER BY amount DESC",
          )
          .bind(ledgerId)
          .all<{ category: string; amount: number }>(),
        db
          .prepare(
            "SELECT COALESCE(SUM(CASE WHEN mood='冲动' THEN amount*(CASE currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN .0462 WHEN 'EUR' THEN 7.85 ELSE 1 END) ELSE 0 END),0) impulse,COALESCE(SUM(amount*(CASE currency WHEN 'USD' THEN 7.2 WHEN 'JPY' THEN .0462 WHEN 'EUR' THEN 7.85 ELSE 1 END)),0) expense FROM transactions WHERE ledger_id=? AND type='支出' AND strftime('%Y-%m',occurred_at)=strftime('%Y-%m','now')",
          )
          .bind(ledgerId)
          .first<{ impulse: number; expense: number }>(),
      ]);
    const context = {
      currency: "CNY",
      netWorthYuan: Math.round((wealth?.netWorth || 0) / 100),
      totalAssetsYuan: Math.round((wealth?.assets || 0) / 100),
      liabilitiesYuan: Math.round((wealth?.liabilities || 0) / 100),
      monthlyCategoryRanking: category.results.map((x) => ({
        category: x.category,
        amountYuan: Math.round(x.amount / 100),
      })),
      impulseSharePercent: mood?.expense
        ? Number(((mood.impulse / mood.expense) * 100).toFixed(1))
        : 0,
    };
    const runtime = env as unknown as Record<string, unknown>,
      ollamaUrl = String(runtime.OLLAMA_URL || "").replace(/\/$/, ""),
      model = String(runtime.OLLAMA_MODEL || "llama3.1:8b");
    const system = `你是 NeoAI 财富智囊。只使用提供的聚合财务上下文回答，不虚构账目。风格精准、温柔、带一点年轻人自嘲幽默。明确区分事实、估算与建议，不提供保证收益。上下文JSON：${JSON.stringify(context)}`;
    if (ollamaUrl) {
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: "system", content: system },
            { role: "user", content: message },
          ],
        }),
      });
      if (!response.ok) throw new Error(`本地模型连接失败：${response.status}`);
      const result = (await response.json()) as {
        message?: { content?: string };
      };
      return NextResponse.json({
        answer: result.message?.content || "模型没有返回内容",
        context,
        provider: "ollama",
      });
    }
    const top = context.monthlyCategoryRanking[0],
      answer = `先看结论：你当前净资产约 ¥${context.netWorthYuan.toLocaleString("zh-CN")}，负债约 ¥${context.liabilitiesYuan.toLocaleString("zh-CN")}。${top ? `本月最大吞金兽是「${top.category}」，花了约 ¥${top.amountYuan.toLocaleString("zh-CN")}。` : "本月账本还很安静。"}冲动消费占 ${context.impulseSharePercent}%。针对“${message}”，建议先把目标价格拆成 6—12 个月月度储蓄额，再用真实月结余校验；如果目标月供会吃掉超过三成可支配结余，Mac 还没买到，钱包可能先开始发热。当前未连接 Ollama，这是基于真实聚合账目的本地规则诊断。`;
    return NextResponse.json({ answer, context, provider: "local-rules" });
  } catch (error) {
    return accessErrorResponse(error, "AI 对话失败");
  }
}
