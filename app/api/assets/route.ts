import { NextResponse } from "next/server";
import {
  ensureDb,
  evaluateDigitalAsset,
  getDbBinding,
  type DigitalAssetRow,
} from "../../../db";
import { accessErrorResponse, claimAndRequireLedger } from "../../api-security";

export const dynamic = "force-dynamic";

type AssetInput = {
  ledgerId?: number;
  name?: string;
  assetType?: "数码设备" | "游戏账号" | "潮流玩具";
  purchasePrice?: number;
  purchaseDate?: string;
  lifespanMonths?: number;
  residualRate?: number;
  heatLevel?: "高" | "中" | "低" | null;
};

const allowedTypes = ["数码设备", "游戏账号", "潮流玩具"] as const;

function validateAsset(body: AssetInput) {
  const name = String(body.name || "").trim().slice(0, 40);
  const assetType = body.assetType;
  const purchasePrice = Math.round(Number(body.purchasePrice) * 100);
  const lifespanMonths = Number(body.lifespanMonths);
  const residualRate = Number(body.residualRate || 0);
  const purchaseDate = String(body.purchaseDate || "");
  if (!name) throw new Error("请输入资产名称");
  if (!allowedTypes.includes(assetType as never))
    throw new Error("请选择资产类型");
  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0)
    throw new Error("请输入正确的购买价格");
  if (
    !Number.isInteger(lifespanMonths) ||
    lifespanMonths < 1 ||
    lifespanMonths > 600
  )
    throw new Error("预期寿命应为 1—600 个月");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate))
    throw new Error("请选择购买日期");
  const date = new Date(`${purchaseDate}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 86400000)
    throw new Error("购买日期不能晚于今天");
  if (!Number.isFinite(residualRate) || residualRate < 0 || residualRate > 100)
    throw new Error("残值率应为 0—100% ");
  const heatLevel =
    assetType === "游戏账号" && ["高", "中", "低"].includes(body.heatLevel || "")
      ? body.heatLevel!
      : null;
  return {
    name,
    assetType: assetType!,
    purchasePrice,
    purchaseDate,
    lifespanMonths,
    residualRateBps: Math.round(residualRate * 100),
    heatLevel,
  };
}

export async function GET(request: Request) {
  await ensureDb();
  const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
  await claimAndRequireLedger(request, ledgerId);
  const rows = await getDbBinding()
    .prepare(
      "SELECT id,ledger_id ledgerId,name,asset_type assetType,purchase_price purchasePrice,purchase_date purchaseDate,lifespan_months lifespanMonths,residual_rate_bps residualRateBps,heat_level heatLevel,created_at createdAt FROM digital_assets WHERE ledger_id=? ORDER BY id DESC",
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
    const value = validateAsset(body);
    const result = await getDbBinding()
      .prepare(
        "INSERT INTO digital_assets(ledger_id,name,asset_type,purchase_price,purchase_date,lifespan_months,residual_rate_bps,heat_level) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        ledgerId,
        value.name,
        value.assetType,
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
      .prepare("SELECT name FROM digital_assets WHERE id=? AND ledger_id=?")
      .bind(id, ledgerId)
      .first<{ name: string }>();
    if (!asset) throw new Error("资产已被注销或不存在");
    if (salePrice > 0) {
      const account = await db
        .prepare(
          "SELECT id,currency FROM accounts WHERE id=? AND ledger_id=? AND type='资产'",
        )
        .bind(accountId, ledgerId)
        .first<{ id: number; currency: string }>();
      if (!account) throw new Error("请选择有效的入账资产账户");
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
