import { z } from "zod";
import { ApiAccessError } from "./api-security";
import { MAX_INTERNAL_API_BODY_BYTES, readJsonWithLimit } from "./request-limits";

const positiveId = z.coerce.number().int().positive("ID 必须是正整数");
const optionalText = (maximum: number) =>
  z.string().trim().max(maximum, `文本最多 ${maximum} 个字符`).optional();
const moneyYuan = z.coerce
  .number()
  .finite()
  .nonnegative("请输入正确金额")
  .max(1_000_000_000, "金额超过系统上限");

const accountFields = {
  ledgerId: positiveId,
  name: z.string().trim().min(1, "请输入账户名称").max(30, "账户名称最多 30 个字符"),
  type: z.enum(["资产", "负债"], { error: "请选择账户类型" }),
  balance: moneyYuan,
  billDay: z.coerce.number().int().min(1, "账单日和还款日应为 1—31").max(31, "账单日和还款日应为 1—31").nullish(),
  repaymentDay: z.coerce.number().int().min(1, "账单日和还款日应为 1—31").max(31, "账单日和还款日应为 1—31").nullish(),
  isInvestment: z.boolean().optional().default(false),
  currency: z.enum(["CNY", "USD", "JPY", "EUR"]).optional().default("CNY"),
  assetClass: z.enum(["现金流", "固收防守", "风险进攻"]).optional(),
};

const accountCreateSchema = z.object(accountFields).strict();
const accountUpdateSchema = z
  .object({
    id: positiveId,
    ...accountFields,
    expectedUpdatedAt: z.string().trim().min(1, "账户版本已失效，请刷新后重试").max(64),
  })
  .strict();
export type AccountInput = z.output<typeof accountCreateSchema>;

const categoryBudgetSchema = z
  .object({
    ledgerId: positiveId,
    category: z.string().trim().min(1, "请选择分类").max(12, "分类名称最多 12 个字符"),
    amount: moneyYuan,
  })
  .strict();

const categoryFields = (defaultIcon: string, defaultColor: string) => ({
  ledgerId: positiveId,
  name: z.string().trim().min(1, "请输入分类名称").max(12, "分类名称最多 12 个字符"),
  icon: z.string().trim().min(1).max(8, "分类图标最多 8 个字符").optional().default(defaultIcon),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "分类颜色格式无效").optional().default(defaultColor),
  isActive: z.boolean().optional().default(true),
});
const expenseCategoryCreateSchema = z.object(categoryFields("📦", "#8f91b8")).strict();
const expenseCategoryUpdateSchema = z.object({ id: positiveId, ...categoryFields("📦", "#8f91b8") }).strict();
const incomeCategoryCreateSchema = z.object(categoryFields("💰", "#78a98c")).strict();
const incomeCategoryUpdateSchema = z.object({ id: positiveId, ...categoryFields("💰", "#78a98c") }).strict();

const idempotencyKey = z
  .string()
  .trim()
  .min(8, "幂等键至少 8 个字符")
  .max(128, "幂等键最多 128 个字符")
  .regex(/^[A-Za-z0-9._:-]+$/, "幂等键格式无效")
  .optional();

const assetFields = {
  ledgerId: positiveId,
  name: z.string().trim().min(1).max(60),
  assetType: z.string().trim().min(1).max(24),
  currency: z.enum(["CNY", "USD", "JPY", "EUR"]).optional().default("CNY"),
  valuationMode: z.enum(["自动折旧", "手动估值"]),
  manualValue: z.coerce.number().finite().optional(),
  purchasePrice: z.coerce.number().finite(),
  purchaseDate: z.string().max(10),
  lifespanMonths: z.coerce.number().finite().optional(),
  residualRate: z.coerce.number().finite().optional(),
  heatLevel: z.enum(["高", "中", "低"]).nullish(),
};
const assetCreateSchema = z.object(assetFields).strict();
const assetUpdateSchema = z.object({ id: positiveId, ...assetFields, expectedUpdatedAt: z.string().trim().min(1, "资产版本已失效，请刷新后重试").max(64) }).strict();
const assetLiquidationSchema = z.object({
  id: positiveId,
  ledgerId: positiveId,
  salePrice: moneyYuan,
  accountId: z.coerce.number().int().nonnegative(),
  expectedUpdatedAt: z.string().trim().min(1, "资产版本已失效，请刷新后重试").max(64),
  idempotencyKey,
}).strict();

const subscriptionFields = {
  ledgerId: positiveId,
  name: z.string().trim().min(1).max(30),
  amount: z.coerce.number().finite().positive().max(1_000_000_000),
  accountId: positiveId,
  cycle: z.enum(["每月", "每季", "每年"], { error: "请选择续费周期" }),
  category: z.string().trim().min(1).max(12),
  nextChargeDate: z.string().max(10),
};
const subscriptionCreateSchema = z.object(subscriptionFields).strict();
const subscriptionUpdateSchema = z.object({ id: positiveId, ...subscriptionFields }).strict();

const installmentSchema = z.object({
  ledgerId: positiveId,
  name: z.string().trim().min(1).max(40),
  totalAmount: moneyYuan.refine((value) => value > 0, "请输入有效的分期总额"),
  periods: z.coerce.number().int().min(1).max(360),
  feeAmount: moneyYuan.optional().default(0),
  accountId: positiveId,
  paymentAccountId: positiveId,
  startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "请选择有效的开始月份"),
  chargeDay: z.coerce.number().int().min(1).max(31),
  idempotencyKey,
}).strict();
const goalCreateSchema = z.object({ ledgerId: positiveId, name: z.string().trim().min(1).max(30), targetAmount: moneyYuan.refine((v) => v > 0), deadline: z.string().max(10), icon: z.string().trim().min(1).max(4).optional().default("🌟") }).strict();
const goalContributionSchema = z.object({ id: positiveId, accountId: positiveId, amount: moneyYuan.refine((v) => v > 0), idempotencyKey }).strict();
const goalDeleteSchema = z.object({ id: positiveId, accountId: z.coerce.number().int().nonnegative(), idempotencyKey, expectedUpdatedAt: z.string().trim().min(1, "目标版本已失效，请刷新后重试").max(64) }).strict();
const memberSchema = z.object({ ledgerId: positiveId, name: z.string().trim().min(1).max(20), icon: z.string().trim().min(1).max(8).optional().default("👤") }).strict();
const settlementSchema = z.object({ ledgerId: positiveId, memberId: positiveId, amount: z.coerce.number().finite().int().positive().max(100_000_000_000), direction: z.enum(["owesMe", "iOwe"]), idempotencyKey }).strict();
const fireSettingsSchema = z.object({ ledgerId: positiveId, monthlyExpense: z.coerce.number().finite().min(100).max(1_000_000_000), annualReturn: z.coerce.number().finite().min(0).max(30) }).strict();
const economicSettingsSchema = z.object({ ledgerId: positiveId, inflationRate: z.coerce.number().finite().min(0).max(50) }).strict();

const preferencesPatchSchema = z.object({ theme: z.enum(["cream", "obsidian", "glacier", "peach"]).optional(), enabled: z.boolean().optional(), pin: z.string().regex(/^\d{4}$/, "请输入4位数字PIN").optional() }).strict().refine((v) => v.theme !== undefined || v.enabled !== undefined, "至少修改一项设置").refine((v) => v.enabled !== true || v.pin !== undefined, "请输入4位数字PIN");
const pinSchema = z.object({ pin: z.string().regex(/^\d{4}$/, "请输入4位数字PIN") }).strict();
const ruleConditionsSchema = z.object({ merchantContains: z.string().trim().min(1).max(80).optional(), source: z.string().trim().min(1).max(40).optional(), minAmount: moneyYuan.optional(), maxAmount: moneyYuan.optional(), accountId: positiveId.optional() }).strict().refine((v) => Object.keys(v).length > 0, "至少设置一个匹配条件").refine((v) => v.minAmount == null || v.maxAmount == null || v.minAmount <= v.maxAmount, "金额范围无效");
const ruleActionsSchema = z.object({ category: z.string().trim().min(1).max(40).optional(), incomeCategory: z.string().trim().min(1).max(40).optional(), mood: z.enum(["悦己", "刚需", "冲动"]).optional(), accountId: positiveId.optional() }).strict().refine((v) => Object.keys(v).length > 0, "至少设置一个自动处理动作");
const automationCreateSchema = z.object({ ledgerId: positiveId, name: z.string().trim().min(1).max(60), priority: z.coerce.number().int().min(0).max(10000).optional().default(100), enabled: z.boolean().optional().default(false), conditions: ruleConditionsSchema, actions: ruleActionsSchema }).strict();
const automationUpdateSchema = z.object({ id: z.string().uuid(), ledgerId: positiveId, name: z.string().trim().min(1).max(60).optional(), priority: z.coerce.number().int().min(0).max(10000).optional(), enabled: z.boolean().optional(), conditions: ruleConditionsSchema.optional(), actions: ruleActionsSchema.optional() }).strict();
const automationDeleteSchema = z.object({ id: z.string().uuid(), ledgerId: positiveId }).strict();
const integrationTokenSchema = z.object({ label: z.string().trim().min(1).max(60).optional().default("自动记账连接"), expiresInDays: z.coerce.number().int().min(1).max(730).optional().default(365), scope: z.literal("ledger:write").optional().default("ledger:write") }).strict();
const ledgerCreateSchema = z.object({ name: z.string().trim().min(1).max(30), icon: z.string().trim().min(1).max(8).optional().default("📒") }).strict();
const ledgerUpdateSchema = z.object({ id: positiveId, name: z.string().trim().min(1).max(30), icon: z.string().trim().min(1).max(8), expectedUpdatedAt: z.string().trim().min(1, "账本版本已失效，请刷新后重试").max(64) }).strict();
const notificationReadSchema = z.object({ ledgerId: positiveId }).strict();
const appUpdateSchema = z.object({ tag: z.string().trim().min(1).max(64) }).strict();
const sessionRevokeSchema = z.object({ sessionId: z.string().uuid().optional(), allExceptCurrent: z.literal(true).optional() }).strict().refine((v) => (v.sessionId ? 1 : 0) + (v.allExceptCurrent ? 1 : 0) === 1, "请选择一个设备注销操作");
const pendingTransactionSchema = z.object({
  id: positiveId,
  category: z.string().trim().min(1, "请选择分类").max(40).nullish(),
  action: z.enum(["confirm", "ignore"]),
}).strict();

const transferSchema = z
  .object({
    ledgerId: positiveId,
    kind: z.enum(["账户转账", "信用卡还款"]),
    fromAccountId: positiveId,
    toAccountId: positiveId,
    amount: z.coerce
      .number()
      .finite()
      .positive("请输入正确的转账金额")
      .max(1_000_000_000, "单笔转账金额过大"),
    idempotencyKey,
    occurredAt: optionalText(64),
    originalTimezone: optionalText(64),
    note: optionalText(120),
  })
  .strict()
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    message: "请选择不同的转出和转入账户",
    path: ["toAccountId"],
  });

const transactionIds = z
  .array(positiveId)
  .min(1, "请至少选择一笔流水")
  .max(500, "单次最多更新 500 笔流水")
  .transform((ids) => [...new Set(ids)]);

const bulkTransactionSchema = z
  .object({
    ledgerId: positiveId,
    transactionIds,
    category: z.string().trim().min(1).max(40).nullish(),
    incomeCategory: z.string().trim().min(1).max(40).nullish(),
    mood: z.enum(["悦己", "刚需", "冲动"]).nullish(),
  })
  .strict()
  .refine(
    (value) =>
      value.category != null ||
      value.incomeCategory != null ||
      value.mood != null,
    { message: "至少选择一个批量修改字段" },
  );

const reconciliationSchema = z
  .object({
    ledgerId: positiveId,
    transactionIds,
    status: z.enum(["unreconciled", "reconciled", "exception"]),
    note: z.string().trim().max(300).nullish(),
  })
  .strict();

export type TransferInput = z.output<typeof transferSchema>;
export type BulkTransactionInput = z.output<typeof bulkTransactionSchema>;
export type ReconciliationInput = z.output<typeof reconciliationSchema>;

export async function readAccountCreateInput(request: Request) {
  return readInternalJson(request, accountCreateSchema);
}

export async function readAccountUpdateInput(request: Request) {
  return readInternalJson(request, accountUpdateSchema);
}

export async function readCategoryBudgetInput(request: Request) {
  return readInternalJson(request, categoryBudgetSchema);
}

export async function readExpenseCategoryCreateInput(request: Request) {
  return readInternalJson(request, expenseCategoryCreateSchema);
}

export async function readExpenseCategoryUpdateInput(request: Request) {
  return readInternalJson(request, expenseCategoryUpdateSchema);
}

export async function readIncomeCategoryCreateInput(request: Request) {
  return readInternalJson(request, incomeCategoryCreateSchema);
}

export async function readIncomeCategoryUpdateInput(request: Request) {
  return readInternalJson(request, incomeCategoryUpdateSchema);
}

export async function readAssetCreateInput(request: Request) {
  return readInternalJson(request, assetCreateSchema);
}

export async function readAssetUpdateInput(request: Request) {
  return readInternalJson(request, assetUpdateSchema);
}

export async function readAssetLiquidationInput(request: Request) {
  return readInternalJson(request, assetLiquidationSchema);
}

export async function readSubscriptionCreateInput(request: Request) {
  return readInternalJson(request, subscriptionCreateSchema);
}

export async function readSubscriptionUpdateInput(request: Request) {
  return readInternalJson(request, subscriptionUpdateSchema);
}

export const readInstallmentInput = (request: Request) => readInternalJson(request, installmentSchema);
export const readGoalCreateInput = (request: Request) => readInternalJson(request, goalCreateSchema);
export const readGoalContributionInput = (request: Request) => readInternalJson(request, goalContributionSchema);
export const readGoalDeleteInput = (request: Request) => readInternalJson(request, goalDeleteSchema);
export const readMemberInput = (request: Request) => readInternalJson(request, memberSchema);
export const readSettlementInput = (request: Request) => readInternalJson(request, settlementSchema);
export const readFireSettingsInput = (request: Request) => readInternalJson(request, fireSettingsSchema);
export const readEconomicSettingsInput = (request: Request) => readInternalJson(request, economicSettingsSchema);
export const readPreferencesPatchInput = (request: Request) => readInternalJson(request, preferencesPatchSchema);
export const readPinInput = (request: Request) => readInternalJson(request, pinSchema);
export const readAutomationCreateInput = (request: Request) => readInternalJson(request, automationCreateSchema);
export const readAutomationUpdateInput = (request: Request) => readInternalJson(request, automationUpdateSchema);
export const readAutomationDeleteInput = (request: Request) => readInternalJson(request, automationDeleteSchema);
export const readIntegrationTokenInput = (request: Request) => readInternalJson(request, integrationTokenSchema);
export const readLedgerCreateInput = (request: Request) => readInternalJson(request, ledgerCreateSchema);
export const readLedgerUpdateInput = (request: Request) => readInternalJson(request, ledgerUpdateSchema);
export const readNotificationReadInput = (request: Request) => readInternalJson(request, notificationReadSchema);
export const readAppUpdateInput = (request: Request) => readInternalJson(request, appUpdateSchema);
export const readSessionRevokeInput = (request: Request) => readInternalJson(request, sessionRevokeSchema);
export const readPendingTransactionInput = (request: Request) => readInternalJson(request, pendingTransactionSchema);

export async function readTransferInput(request: Request) {
  return readInternalJson(request, transferSchema);
}

export async function readBulkTransactionInput(request: Request) {
  return readInternalJson(request, bulkTransactionSchema);
}

export async function readReconciliationInput(request: Request) {
  return readInternalJson(request, reconciliationSchema);
}

async function readInternalJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  const body = await readJsonWithLimit<unknown>(
    request,
    MAX_INTERNAL_API_BODY_BYTES,
  );
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ApiAccessError(issue?.message || "请求字段无效", 400);
  }
  return result.data;
}
