import type { RefObject } from "react";
import type { AnalysisDimension } from "./ledger-analysis-core";
import type { FinancialInsights } from "./financial-insights-core";

type AnalyticsModel = {
  incomeTotal: number;
  expenseTotal: number;
  balance: number;
  savingRate: number;
  needExpense: number;
  investmentIncome: number;
};

type ForecastModel = {
  bankruptcyDate?: string | null;
  dataStatus?: string;
  runwayDays?: number | null;
  averageDailySpend?: number;
  monthlyFixed?: number;
  netWorth?: number;
} | null | undefined;

export type StressEvents = {
  unemployment: boolean;
  crash: boolean;
  emergency: boolean;
};

type Props = {
  dimension: AnalysisDimension;
  analysis: AnalyticsModel;
  insights: FinancialInsights;
  forecast: ForecastModel;
  fireMonthlyExpense: number;
  fireAnnualReturnBps: number;
  pending: boolean;
  stressEvents: StressEvents;
  lineCanvas: RefObject<HTMLCanvasElement | null>;
  pieCanvas: RefObject<HTMLCanvasElement | null>;
  moodCanvas: RefObject<HTMLCanvasElement | null>;
  forecastCanvas: RefObject<HTMLCanvasElement | null>;
  formatMoney: (amount: number) => string;
  onDimensionChange: (dimension: AnalysisDimension) => void;
  onSaveFire: (formData: FormData) => void | Promise<void>;
  onStressEventsChange: (next: StressEvents) => void;
};

export function AnalyticsSection({
  dimension,
  analysis,
  insights,
  forecast,
  fireMonthlyExpense,
  fireAnnualReturnBps,
  pending,
  stressEvents,
  lineCanvas,
  pieCanvas,
  moodCanvas,
  forecastCanvas,
  formatMoney,
  onDimensionChange,
  onSaveFire,
  onStressEventsChange,
}: Props) {
  const {
    allocation,
    allocationTotal,
    cashRatio,
    debtRatio,
    netWorthCny,
    fireTarget,
    fireProgress,
    liabilityTotal,
    stressedNet,
    stressRunway,
    liquidAssets,
    resilienceScore,
    sideIncomeCny,
    sideCostCny,
    sideProfit,
    estimatedTax,
  } = insights;
  const updateStress = (key: keyof StressEvents, checked: boolean) =>
    onStressEventsChange({ ...stressEvents, [key]: checked });

  return (
    <section className="analytics-page">
      <div className="analytics-head">
        <div>
          <p className="eyebrow">FULL SPECTRUM ANALYTICS</p>
          <h2>动态财务分析</h2>
          <span>
            {dimension}维度 · 收入 {formatMoney(analysis.incomeTotal / 100)} · 支出 {formatMoney(analysis.expenseTotal / 100)}
          </span>
        </div>
        <div className="dimension-switch">
          {(["日", "月", "年"] as AnalysisDimension[]).map((item) => (
            <button
              className={dimension === item ? "active" : ""}
              onClick={() => onDimensionChange(item)}
              key={item}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="health-grid">
        <article>
          <span>本期净结余</span>
          <strong className={analysis.balance >= 0 ? "healthy" : "danger"}>
            {formatMoney(analysis.balance / 100)}
          </strong>
        </article>
        <article>
          <span>储蓄率</span>
          <strong>{analysis.savingRate.toFixed(1)}%</strong>
        </article>
        <article>
          <span>财务健康度</span>
          <strong>
            {analysis.savingRate >= 30
              ? "优秀"
              : analysis.savingRate >= 10
                ? "稳健"
                : analysis.balance >= 0
                  ? "待提升"
                  : "需关注"}
          </strong>
        </article>
      </div>
      <article className="insight-card">
        <span>✨ 模拟 AI 财务点评</span>
        <p>
          {analysis.incomeTotal || analysis.expenseTotal
            ? `本期净结余 ${formatMoney(analysis.balance / 100)}，储蓄率 ${analysis.savingRate.toFixed(1)}%。您的理财收益已覆盖 ${analysis.needExpense ? ((analysis.investmentIncome / analysis.needExpense) * 100).toFixed(1) : "0.0"}% 的刚需支出；${analysis.savingRate >= 20 ? "现金流表现不错，继续保持长期主义。" : "建议给冲动消费设一道冷静期，把工资留在账户里久一点。"}`
            : "当前时间范围内还没有资金流，专业分析正在等待真实数据。"}
        </p>
      </article>
      <div className="pro-chart-grid">
        <article className="pro-chart-card line-card trend-card">
          <div>
            <h3>资产资金趋势</h3>
            <p>橙色支出 · 绿色收入 · 渐变阴影</p>
          </div>
          <div className="canvas-wrap line-wrap"><canvas ref={lineCanvas} /></div>
        </article>
        <article className="pro-chart-card">
          <div>
            <h3>支出分类 × 情绪双环</h3>
            <p>外环消费分类，内环情绪成分</p>
          </div>
          <div className="canvas-wrap"><canvas ref={pieCanvas} /></div>
        </article>
        <article className="pro-chart-card">
          <div>
            <h3>收入来源结构</h3>
            <p>薪资、理财、兼职与其它收入</p>
          </div>
          <div className="canvas-wrap"><canvas ref={moodCanvas} /></div>
        </article>
      </div>
      <article className="allocation-tower">
        <div>
          <p className="eyebrow">ALL WEATHER ALLOCATION</p>
          <h3>⚖️ 智能资产调仓控制塔</h3>
          <span>参考全天候思想的本地资产大类诊断，不构成投资建议</span>
        </div>
        <div className="allocation-bars">
          {allocation.map((item) => {
            const ratio = (item.amount / allocationTotal) * 100;
            return (
              <section key={item.name}>
                <div>
                  <span>
                    {item.name === "现金流" ? "💧" : item.name === "固收防守" ? "🛡️" : "🚀"} {item.name}
                  </span>
                  <b>{ratio.toFixed(1)}%</b>
                </div>
                <div>
                  <i
                    className={item.name === "现金流" ? "cash" : item.name === "固收防守" ? "fixed" : "risk"}
                    style={{ width: `${ratio}%` }}
                  />
                </div>
                <small>{formatMoney(item.amount / 100)}</small>
              </section>
            );
          })}
        </div>
        {cashRatio > 70 && (
          <div className="allocation-warning gold">
            ! 资产闲置预警：现金类资产占 {cashRatio.toFixed(1)}%，建议将约 {(cashRatio - 50).toFixed(1)}% 转换为固收或与你风险承受力匹配的低风险资产。
          </div>
        )}
        {debtRatio >= 40 && (
          <div className="allocation-warning red">
            ! 安全降杠杆警报：负债已达到总资产的 {debtRatio.toFixed(1)}%，请优先偿还高息负债。
          </div>
        )}
        {cashRatio <= 70 && debtRatio < 40 && (
          <div className="allocation-warning green">资产结构处于可控区间。继续保持现金、固收和风险资产之间的缓冲层。</div>
        )}
      </article>
      <article className="fire-dashboard module-planning">
        <div className="fire-head">
          <div>
            <p className="eyebrow">FIRE FLIGHT PLAN</p>
            <h3>🌅 FIRE 赛博退休终极航线</h3>
            <span>4% 原则目标 · 当前年化假设 {(fireAnnualReturnBps / 100).toFixed(1)}%</span>
          </div>
          <div className="fire-score" style={{ "--fire": fireProgress } as React.CSSProperties}>
            <strong>{fireProgress >= 100 ? "100" : fireProgress.toFixed(1)}%</strong>
            <small>安全躺平指数</small>
          </div>
        </div>
        <form action={onSaveFire}>
          <label>
            <span>理想退休月开销</span>
            <input name="monthlyExpense" type="number" min="100" step="100" defaultValue={(fireMonthlyExpense / 100).toFixed(0)} />
          </label>
          <label>
            <span>预计年化收益率</span>
            <input name="annualReturn" type="number" min="0" max="30" step="0.1" defaultValue={(fireAnnualReturnBps / 100).toFixed(1)} />
          </label>
          <button disabled={pending} type="submit">重算航线</button>
        </form>
        <div className="fire-numbers">
          <div><span>FIRE 终极数字</span><strong>{formatMoney(fireTarget / 100)}</strong></div>
          <div><span>当前净资产</span><strong>{formatMoney(netWorthCny / 100)}</strong></div>
          <div><span>距离退休星港</span><strong>{formatMoney(Math.max(0, fireTarget - netWorthCny) / 100)}</strong></div>
        </div>
        <div className="fire-route">
          <i style={{ width: `${fireProgress}%` }} />
          <svg viewBox="0 0 1000 180" preserveAspectRatio="none" aria-hidden="true"><path d="M10 160 C 210 150, 270 115, 410 110 S 650 70, 760 62 S 910 20, 990 12" /></svg>
          {([
            { at: Math.min(18, ((fireMonthlyExpense * 6) / fireTarget) * 100), name: "半年备用金", done: netWorthCny >= fireMonthlyExpense * 6 },
            { at: 35, name: "摆脱被动负债", done: liabilityTotal <= 0 },
            { at: 60, name: "基础生存自由", done: fireProgress >= 60 },
            { at: 96, name: "终极赛博退休", done: fireProgress >= 100 },
          ] as { at: number; name: string; done: boolean }[]).map((item) => (
            <div className={`fire-node ${item.done ? "done" : ""}`} style={{ "--at": `${item.at}%` } as React.CSSProperties} key={item.name}>
              <b>{item.done ? "✦" : "○"}</b><span>{item.name}</span>
            </div>
          ))}
        </div>
        <p>按 4% 提取率估算，你的目标资产约为理想年开销的 25 倍。收益率用于展示预期，不改变 4% 目标数字，也不构成收益承诺。</p>
      </article>
      <article className="forecast-card">
        <div className="forecast-head">
          <div><p className="eyebrow">FUTURE VISION</p><h3>🔮 未来现金流预测</h3><span>净资产 + 近 90 天烧钱速度 + 固定订阅</span></div>
          <div className="forecast-pills"><span>3个月</span><span>6个月</span><span>12个月</span></div>
        </div>
        <div className="canvas-wrap forecast-wrap"><canvas ref={forecastCanvas} /></div>
        {forecast?.bankruptcyDate ? (
          <div className="bankruptcy-alert">! 破产预警：按照您当前的烧钱速度，您的资产将在 {forecast.bankruptcyDate} 耗尽，请立刻开启省钱模式！</div>
        ) : forecast?.dataStatus === "insufficient_data" ? (
          <div className="lighthouse">资产灯塔：暂时没有足够的消费数据，添加几笔真实流水后再开始预测。</div>
        ) : (
          <div className="lighthouse">资产灯塔：您的财务状况极其健康，目前资金足以支撑您无收入躺平 {forecast?.runwayDays ?? "计算中"} 天。</div>
        )}
        <div className="forecast-metrics">
          <span>日均消费 <b>{formatMoney((forecast?.averageDailySpend ?? 0) / 100)}</b></span>
          <span>月均固定开销 <b>{formatMoney((forecast?.monthlyFixed ?? 0) / 100)}</b></span>
          <span>当前预测净资产 <b>{formatMoney((forecast?.netWorth ?? 0) / 100)}</b></span>
        </div>
      </article>
      <article className="stress-lab">
        <div className="stress-head">
          <div><p className="eyebrow">BLACK SWAN LAB</p><h3>🌪️ 资金测试沙盘</h3><span>仅在前端内存演练，不修改任何真实账户与账单</span></div>
          <div className="resilience-gauge" style={{ "--score": `${resilienceScore * 3.6}deg` } as React.CSSProperties}>
            <div><strong>{resilienceScore}</strong><small>财务韧性</small></div>
          </div>
        </div>
        <div className="stress-events">
          <label className={stressEvents.unemployment ? "active" : ""}>
            <input type="checkbox" checked={stressEvents.unemployment} onChange={(event) => updateStress("unemployment", event.target.checked)} />
            <span>🏢</span><div><strong>老板明天把公司解散了</strong><small>工资收入归零，测算无收入生存跑道</small></div>
          </label>
          <label className={stressEvents.crash ? "active" : ""}>
            <input type="checkbox" checked={stressEvents.crash} onChange={(event) => updateStress("crash", event.target.checked)} />
            <span>📉</span><div><strong>理财资产腰斩</strong><small>投资账户瞬间蒸发 50%</small></div>
          </label>
          <label className={stressEvents.emergency ? "active" : ""}>
            <input type="checkbox" checked={stressEvents.emergency} onChange={(event) => updateStress("emergency", event.target.checked)} />
            <span>🏥</span><div><strong>突发 ¥30,000 紧急支出</strong><small>检验现金类账户流动性是否断裂</small></div>
          </label>
        </div>
        <div className="stress-result">
          <div><span>F-Runway 生存跑道</span><strong>{stressRunway === null ? "暂无数据" : `${stressRunway} 天`}</strong></div>
          <div><span>压力后净资产</span><strong>{formatMoney(stressedNet / 100)}</strong></div>
          <p>
            {resilienceScore >= 80
              ? "您的财务防波堤相当扎实，但仍建议保留 6—12 个月现金应急金。"
              : resilienceScore >= 50
                ? "韧性处于可守区间。优先补足现金储备，并降低固定订阅与高波动资产集中度。"
                : "警报：一次意外就可能击穿现金流。先暂停非必要消费，建立至少 3 个月应急金。"}
            {liquidAssets < 0 ? " 当前现金类账户无法独立覆盖 3 万元突发支出。" : " 当前现金流动性可以覆盖本次突发测试。"}
          </p>
        </div>
      </article>
      <article className="side-hustle-dashboard">
        <div><p className="eyebrow">SLASH CAREER P&amp;L</p><h3>💼 综合税筹</h3><span>本月副业经营视角 · 金额统一折算人民币</span></div>
        <div className="side-profit-grid">
          <section><span>副业收入</span><strong>{formatMoney(sideIncomeCny / 100)}</strong></section>
          <section><span>副业成本</span><strong>{formatMoney(sideCostCny / 100)}</strong></section>
          <section><span>副业净利润</span><strong>{formatMoney(sideProfit / 100)}</strong></section>
          <section className="tax-number"><span>预计预扣税</span><strong>{formatMoney(estimatedTax / 100)}</strong></section>
        </div>
        <p>当前副业收入预计需预扣税 {formatMoney(estimatedTax / 100)}，税后并扣除已标记成本，预计真实落袋 {formatMoney(Math.max(0, sideIncomeCny - sideCostCny - estimatedTax) / 100)}。成本标签用于经营利润管理，不代表当然可以在劳务报酬预扣环节税前扣除；最终以扣缴凭证和年度汇算为准。</p>
        <small>精简估算口径：单次/月度聚合模拟；≤¥4,000 减 ¥800，超过 ¥4,000 减 20%费用，再按 20%/30%/40%预扣率及速算扣除数计算。</small>
      </article>
    </section>
  );
}
