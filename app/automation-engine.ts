export type AutomationConditions = {
  merchantContains?: string;
  source?: string;
  minAmount?: number;
  maxAmount?: number;
  accountId?: number;
};

export type AutomationActions = {
  category?: string;
  incomeCategory?: string;
  mood?: "悦己" | "刚需" | "冲动";
  accountId?: number;
};

export type AutomationRule = {
  id: string;
  name: string;
  conditions: AutomationConditions;
  actions: AutomationActions;
};

export type PendingAutomationInput = {
  rawText: string;
  title: string;
  amount: number;
  accountId: number;
};

export function matchAutomationRule(
  input: PendingAutomationInput,
  rules: AutomationRule[],
) {
  for (const rule of rules) {
    const conditions = rule.conditions;
    const reasons: string[] = [];
    if (conditions.merchantContains) {
      const needle = conditions.merchantContains.toLocaleLowerCase();
      if (!`${input.title}\n${input.rawText}`.toLocaleLowerCase().includes(needle)) continue;
      reasons.push(`商户包含“${conditions.merchantContains}”`);
    }
    if (conditions.source) {
      if (!input.rawText.toLocaleLowerCase().includes(conditions.source.toLocaleLowerCase())) continue;
      reasons.push(`来源包含“${conditions.source}”`);
    }
    if (conditions.minAmount != null) {
      if (input.amount < conditions.minAmount) continue;
      reasons.push(`金额不低于 ${(conditions.minAmount / 100).toFixed(2)}`);
    }
    if (conditions.maxAmount != null) {
      if (input.amount > conditions.maxAmount) continue;
      reasons.push(`金额不高于 ${(conditions.maxAmount / 100).toFixed(2)}`);
    }
    if (conditions.accountId != null) {
      if (input.accountId !== conditions.accountId) continue;
      reasons.push("账户匹配");
    }
    return { ruleId: rule.id, ruleName: rule.name, actions: rule.actions, reasons };
  }
  return null;
}
