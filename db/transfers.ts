import { getDbBinding } from ".";
import { localDateTimeToUtc } from "../app/time-money.js";

export type TransferKind =
  | "账户转账"
  | "储蓄存入"
  | "储蓄退款"
  | "信用卡还款"
  | "分期还款"
  | "负债入账"
  | "分期撤销"
  | "人情平账"
  | "余额调账";

export async function createAccountTransfer(input: {
  ledgerId: number;
  kind: TransferKind;
  fromAccountId?: number | null;
  toAccountId?: number | null;
  amount: number;
  currency: string;
  targetType?: string | null;
  targetId?: number | null;
  occurrenceKey?: string | null;
  occurredAt?: string;
  originalTimezone?: string;
  note?: string;
}) {
  const db = getDbBinding();
  const timezone = input.originalTimezone || "Asia/Shanghai";
  const result = await db
    .prepare(
      "INSERT INTO account_transfers(uuid,ledger_id,kind,from_account_id,to_account_id,amount,currency,target_type,target_id,occurrence_key,occurred_at,original_timezone,note) VALUES(lower(hex(randomblob(16))),?,?,?,?,?,?,?,?,?,?,?,?) RETURNING uuid",
    )
    .bind(
      input.ledgerId,
      input.kind,
      input.fromAccountId ?? null,
      input.toAccountId ?? null,
      Math.round(input.amount),
      input.currency,
      input.targetType ?? null,
      input.targetId ?? null,
      input.occurrenceKey ?? null,
      localDateTimeToUtc(input.occurredAt || new Date().toISOString(), timezone),
      timezone,
      String(input.note || "").slice(0, 120),
    )
    .first<{ uuid: string }>();
  if (!result) throw new Error("转账未完成");
  return result.uuid;
}
