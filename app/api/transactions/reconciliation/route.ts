import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../../api-security";
import { recordAuditEvent, requestIdFromRequest } from "../../../audit-log";
import { readReconciliationInput } from "../../../internal-api-contract";

function privateJson(body: unknown) {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { headers });
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger"));
    await claimAndRequireLedger(request, ledgerId);
    const rawIds = new URL(request.url).searchParams.get("ids");
    const ids = rawIds
      ? rawIds.split(",").filter(Boolean).map(Number)
      : [];
    if (ids.length > 100 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0))
      throw new Error("对账流水范围无效");
    const idPredicate = ids.length ? ` AND t.id IN (${ids.map(() => "?").join(",")})` : "";
    const rows = await getDbBinding()
      .prepare(
        `SELECT t.id transactionId,t.title,t.amount,t.type,t.account_id accountId,
                COALESCE(r.status,'unreconciled') status,r.note,r.reconciled_at reconciledAt,
                r.reconciled_by reconciledBy
         FROM transactions t LEFT JOIN transaction_reconciliation r ON r.transaction_id=t.id
         WHERE t.ledger_id=?${idPredicate} ORDER BY t.occurred_at DESC,t.id DESC${ids.length ? "" : " LIMIT 100"}`,
      )
      .bind(ledgerId, ...ids)
      .all();
    return privateJson(rows.results);
  } catch (error) {
    return accessErrorResponse(error, "读取对账状态失败", request);
  }
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await readReconciliationInput(request);
    const { ledgerId, transactionIds: ids, status } = body;
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const placeholders = ids.map(() => "?").join(",");
    const owned = await db
      .prepare(`SELECT id FROM transactions WHERE ledger_id=? AND id IN (${placeholders})`)
      .bind(ledgerId, ...ids)
      .all<{ id: number }>();
    if (owned.results.length !== ids.length) throw new Error("存在不属于当前账本的流水");
    const note = body.note || null;
    await db.batch(
      ids.map((id) =>
        db
          .prepare(
            `INSERT INTO transaction_reconciliation(transaction_id,ledger_id,status,note,reconciled_by,reconciled_at,updated_at)
             VALUES(?,?,?,?,?,CASE WHEN ?='reconciled' THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP)
             ON CONFLICT(transaction_id) DO UPDATE SET status=excluded.status,note=excluded.note,
               reconciled_by=excluded.reconciled_by,reconciled_at=excluded.reconciled_at,updated_at=CURRENT_TIMESTAMP`,
          )
          .bind(id, ledgerId, status, note, ownerId, status),
      ),
    );
    await recordAuditEvent({
      ownerId,
      eventType: "transaction.reconcile",
      subjectType: "ledger",
      subjectId: ledgerId,
      requestId: requestIdFromRequest(request),
      metadata: { count: ids.length, status },
    });
    return privateJson({ ok: true, updated: ids.length });
  } catch (error) {
    return accessErrorResponse(error, "更新对账状态失败", request);
  }
}
