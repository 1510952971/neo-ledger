import { NextResponse } from "next/server";
import {
  ensureDb,
  evaluateDigitalAsset,
  getDbBinding,
  type DigitalAssetRow,
} from "../../../db";
import { normalizeAssetInput } from "../../asset-core.js";
import { ApiAccessError, accessErrorResponse, claimAndRequireLedger, guardedApiResponse } from "../../api-security";
import { readAssetCreateInput, readAssetLiquidationInput, readAssetUpdateInput } from "../../internal-api-contract";
import { MAX_ASSET_COUNT } from "../../asset-limits";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

type ExistingLiquidation = {
  amount: number;
  accountId: number;
};

function duplicateLiquidationResponse(
  existing: ExistingLiquidation,
  accountId: number,
  salePrice: number,
) {
  if (existing.accountId !== accountId || existing.amount !== salePrice)
    throw new ApiAccessError("幂等键已经用于其他资产变现", 409);
  return privateJson({ ok: true, duplicate: true, incomeCreated: true });
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取资产失败", async () => {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const total = await db
      .prepare("SELECT COUNT(*) count FROM digital_assets WHERE ledger_id=?")
      .bind(ledgerId)
      .first<{ count: number }>();
    const rows: { results: DigitalAssetRow[] } = await db
      .prepare(
        "SELECT id,ledger_id ledgerId,name,asset_type assetType,currency,valuation_mode valuationMode,manual_value manualValue,purchase_price purchasePrice,purchase_date purchaseDate,lifespan_months lifespanMonths,residual_rate_bps residualRateBps,heat_level heatLevel,updated_at updatedAt,created_at createdAt FROM digital_assets WHERE ledger_id=? ORDER BY id DESC LIMIT ?",
      )
      .bind(ledgerId, MAX_ASSET_COUNT)
      .all<DigitalAssetRow>();
    const response = privateJson(rows.results.map((row) => evaluateDigitalAsset(row)));
    const totalCount = Number(total?.count ?? 0);
    response.headers.set("X-Total-Count", String(totalCount));
    response.headers.set("X-Has-More", totalCount > MAX_ASSET_COUNT ? "1" : "0");
    return response;
  });
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = await readAssetCreateInput(request);
    const ledgerId = body.ledgerId;
    await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const count = await db
      .prepare("SELECT COUNT(*) count FROM digital_assets WHERE ledger_id=?")
      .bind(ledgerId)
      .first<{ count: number }>();
    if (Number(count?.count ?? 0) >= MAX_ASSET_COUNT)
      throw new ApiAccessError("数字资产最多 " + MAX_ASSET_COUNT + " 个", 409);
    const value = normalizeAssetInput(body);
    const result = await db
      .prepare(
        "INSERT INTO digital_assets(ledger_id,name,asset_type,currency,valuation_mode,manual_value,purchase_price,purchase_date,lifespan_months,residual_rate_bps,heat_level,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        ledgerId,
        value.name,
        value.assetType,
        value.currency,
        value.valuationMode,
        value.manualValue,
        value.purchasePrice,
        value.purchaseDate,
        value.lifespanMonths,
        value.residualRateBps,
        value.heatLevel,
        new Date().toISOString(),
      )
      .run();
    return privateJson(
      { id: Number(result.meta.last_row_id) },
      { status: 201 },
    );
  } catch (error) {
    return accessErrorResponse(error, "添置失败", request);
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = await readAssetUpdateInput(request);
    const id = body.id;
    const ledgerId = body.ledgerId;
    await claimAndRequireLedger(request, ledgerId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("资产不存在");
    const value = normalizeAssetInput(body);
    const result = await getDbBinding()
      .prepare(
        "UPDATE digital_assets SET name=?,asset_type=?,currency=?,valuation_mode=?,manual_value=?,purchase_price=?,purchase_date=?,lifespan_months=?,residual_rate_bps=?,heat_level=?,updated_at=? WHERE id=? AND ledger_id=? AND updated_at=?",
      )
      .bind(
        value.name,
        value.assetType,
        value.currency,
        value.valuationMode,
        value.manualValue,
        value.purchasePrice,
        value.purchaseDate,
        value.lifespanMonths,
        value.residualRateBps,
        value.heatLevel,
        new Date().toISOString(),
        id,
        ledgerId,
        body.expectedUpdatedAt,
      )
      .run();
    if (!Number(result.meta.changes)) throw new Error("资产已被删除或不属于当前账本");
    return privateJson({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "修改资产失败", request);
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureDb();
    const body = await readAssetLiquidationInput(request);
    const id = body.id;
    const ledgerId = body.ledgerId;
    const salePrice = Math.round(body.salePrice * 100);
    const accountId = body.accountId;
    const ownerId = await claimAndRequireLedger(request, ledgerId);
    const db = getDbBinding();
    const occurrenceKey = body.idempotencyKey
      ? `manual:${ownerId}:asset-liquidation:${id}:${body.idempotencyKey}`
      : null;
    if (occurrenceKey && salePrice > 0) {
      const existing = await db
        .prepare("SELECT amount,account_id accountId FROM transactions WHERE ledger_id=? AND occurrence_key=? AND type='收入'")
        .bind(ledgerId, occurrenceKey)
        .first<ExistingLiquidation>();
      if (existing) return duplicateLiquidationResponse(existing, accountId, salePrice);
    }
    const asset = await db
      .prepare("SELECT name,currency,updated_at updatedAt FROM digital_assets WHERE id=? AND ledger_id=?")
      .bind(id, ledgerId)
      .first<{ name: string; currency: string; updatedAt: string }>();
    if (!asset) throw new Error("资产已被注销或不存在");
    if (asset.updatedAt !== body.expectedUpdatedAt)
      return privateJson({ error: "这项资产已在其他位置更新，请刷新后重试" }, { status: 409 });
    const nextUpdatedAt = new Date().toISOString();
    if (salePrice > 0) {
      const account = await db
        .prepare(
          "SELECT id,currency FROM accounts WHERE id=? AND ledger_id=? AND type='资产' AND currency=?",
        )
        .bind(accountId, ledgerId, asset.currency)
        .first<{ id: number; currency: string }>();
      if (!account) throw new Error(`请选择 ${asset.currency} 币种的入账资产账户`);
      try {
        const results = await db.batch([
          db.prepare("UPDATE digital_assets SET updated_at=? WHERE id=? AND ledger_id=? AND updated_at=?").bind(nextUpdatedAt, id, ledgerId, asset.updatedAt),
          db.prepare("UPDATE accounts SET current_balance=current_balance+? WHERE id=? AND ledger_id=? AND type='资产' AND currency=? AND EXISTS (SELECT 1 FROM digital_assets WHERE id=? AND ledger_id=? AND updated_at=? AND changes()>0)").bind(salePrice, account.id, ledgerId, account.currency, id, ledgerId, nextUpdatedAt),
          db.prepare("INSERT INTO transactions(ledger_id,title,amount,type,income_category,income_category_dynamic,account_id,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,occurrence_key,occurred_at) SELECT ?,? ,?,'收入','其它收入','其它收入',?,?,?,?,1000000,'Asia/Shanghai',?,strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE EXISTS (SELECT 1 FROM digital_assets WHERE id=? AND ledger_id=? AND updated_at=? AND changes()>0)").bind(ledgerId, `二手变现 · ${asset.name}`, salePrice, account.id, account.currency, salePrice, account.currency, occurrenceKey, id, ledgerId, nextUpdatedAt),
          db.prepare("DELETE FROM digital_assets WHERE id=? AND ledger_id=? AND updated_at=? AND changes()>0").bind(id, ledgerId, nextUpdatedAt),
        ]);
        if (Number(results.at(-1)?.meta.changes ?? 0) !== 1)
          return privateJson({ error: "这项资产已在其他位置更新，请刷新后重试" }, { status: 409 });
      } catch (error) {
        if (occurrenceKey && error instanceof Error && /unique|constraint/iu.test(error.message)) {
          const existing = await db
            .prepare("SELECT amount,account_id accountId FROM transactions WHERE ledger_id=? AND occurrence_key=? AND type='收入'")
            .bind(ledgerId, occurrenceKey)
            .first<ExistingLiquidation>();
          if (existing) return duplicateLiquidationResponse(existing, accountId, salePrice);
        }
        throw error;
      }
    } else {
      const discarded = await db.batch([
        db.prepare("UPDATE digital_assets SET updated_at=? WHERE id=? AND ledger_id=? AND updated_at=?").bind(nextUpdatedAt, id, ledgerId, asset.updatedAt),
        db.prepare("DELETE FROM digital_assets WHERE id=? AND ledger_id=? AND updated_at=? AND changes()>0").bind(id, ledgerId, nextUpdatedAt),
      ]);
      if (Number(discarded.at(-1)?.meta.changes ?? 0) !== 1)
        return privateJson({ error: "这项资产已在其他位置更新，请刷新后重试" }, { status: 409 });
    }
    return privateJson({ ok: true, duplicate: false, incomeCreated: salePrice > 0 });
  } catch (error) {
    return accessErrorResponse(error, "变现失败", request);
  }
}
