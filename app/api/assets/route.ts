import { NextResponse } from "next/server";
import {
  ensureDb,
  evaluateDigitalAsset,
  getDbBinding,
  type DigitalAssetRow,
} from "../../../db";
import { normalizeAssetInput } from "../../asset-core.js";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";

export const dynamic = "force-dynamic";

type AssetInput = {
  id?: number;
  ledgerId?: number;
  name?: string;
  assetType?: string;
  currency?: "CNY" | "USD" | "JPY" | "EUR";
  valuationMode?: "自动折旧" | "手动估值";
  manualValue?: number;
  purchasePrice?: number;
  purchaseDate?: string;
  lifespanMonths?: number;
  residualRate?: number;
  heatLevel?: "高" | "中" | "低" | null;
};

export async function GET(request: Request) {
  await ensureDb();
  const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
  await claimAndRequireLedger(request, ledgerId);
  const rows: { results: DigitalAssetRow[] } = await getDbBinding()
    .prepare(
      "SELECT id,ledger_id ledgerId,name,asset_type assetType,currency,valuation_mode valuationMode,manual_value manualValue,purchase_price purchasePrice,purchase_date purchaseDate,lifespan_months lifespanMonths,residual_rate_bps residualRateBps,heat_level heatLevel,created_at createdAt FROM digital_assets WHERE ledger_id=? ORDER BY id DESC",
    )
    .bind(ledgerId)
    .all<DigitalAssetRow>();
  return NextResponse.json(rows.results.map((row) => evaluateDigitalAsset(row)));
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as AssetInput;
    const ledgerId = Number(body.ledgerId || 1);
    await claimAndRequireLedger(request, ledgerId);
    const value = normalizeAssetInput(body);
    const result = await getDbBinding()
      .prepare(
        "INSERT INTO digital_assets(ledger_id,name,asset_type,currency,valuation_mode,manual_value,purchase_price,purchase_date,lifespan_months,residual_rate_bps,heat_level) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
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
      )
      .run();
    return NextResponse.json(
      { id: Number(result.meta.last_row_id) },
      { status: 201 },
    );
  } catch (error) {
    return accessErrorResponse(error, "添置失败");
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as AssetInput;
    const id = Number(body.id);
    const ledgerId = Number(body.ledgerId || 1);
    await claimAndRequireLedger(request, ledgerId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("资产不存在");
    const value = normalizeAssetInput(body);
    const result = await getDbBinding()
      .prepare(
        "UPDATE digital_assets SET name=?,asset_type=?,currency=?,valuation_mode=?,manual_value=?,purchase_price=?,purchase_date=?,lifespan_months=?,residual_rate_bps=?,heat_level=? WHERE id=? AND ledger_id=?",
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
        id,
        ledgerId,
      )
      .run();
    if (!Number(result.meta.changes)) throw new Error("资产已被删除或不属于当前账本");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "修改资产失败");
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureDb();
    const body = (await request.json()) as {
      id?: number;
      ledgerId?: number;
      salePrice?: number;
      accountId?: number;
    };
    const id = Number(body.id);
    const ledgerId = Number(body.ledgerId || 1);
    const salePrice = Math.round(Number(body.salePrice || 0) * 100);
    const accountId = Number(body.accountId || 0);
    await claimAndRequireLedger(request, ledgerId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("资产不存在");
    if (!Number.isFinite(salePrice) || salePrice < 0)
      throw new Error("请输入正确的变现价格");
    const db = getDbBinding();
    const asset = await db
      .prepare("SELECT name,currency FROM digital_assets WHERE id=? AND ledger_id=?")
      .bind(id, ledgerId)
      .first<{ name: string; currency: string }>();
    if (!asset) throw new Error("资产已被注销或不存在");
    if (salePrice > 0) {
      const account = await db
        .prepare(
          "SELECT id,currency FROM accounts WHERE id=? AND ledger_id=? AND type='资产' AND currency=?",
        )
        .bind(accountId, ledgerId, asset.currency)
        .first<{ id: number; currency: string }>();
      if (!account) throw new Error(`请选择 ${asset.currency} 币种的入账资产账户`);
      await db.batch([
        db
          .prepare(
            "INSERT INTO transactions(ledger_id,title,amount,type,income_category,income_category_dynamic,account_id,currency,original_amount,original_currency,exchange_rate_micros,original_timezone,occurred_at) VALUES(?,?,?,'收入','其它收入','其它收入',?,?,?,?,1000000,'Asia/Shanghai',strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
          )
          .bind(
            ledgerId,
            `二手变现 · ${asset.name}`,
            salePrice,
            account.id,
            account.currency,
            salePrice,
            account.currency,
          ),
        db
          .prepare("UPDATE accounts SET current_balance=current_balance+? WHERE id=?")
          .bind(salePrice, account.id),
        db.prepare("DELETE FROM digital_assets WHERE id=?").bind(id),
      ]);
    } else {
      await db.prepare("DELETE FROM digital_assets WHERE id=?").bind(id).run();
    }
    return NextResponse.json({ ok: true, incomeCreated: salePrice > 0 });
  } catch (error) {
    return accessErrorResponse(error, "变现失败");
  }
}
