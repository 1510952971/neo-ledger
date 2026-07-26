import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../../db";
import { accessErrorResponse, requestOwnerId } from "../../../api-security";
import {
  createIntegrationToken,
  ensureIntegrationTokenTable,
  hashIntegrationToken,
} from "../../../integration-token";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureDb();
    await ensureIntegrationTokenTable();
    const ownerId = await requestOwnerId(request);
    const row = await getDbBinding()
      .prepare(
        "SELECT token_prefix tokenPrefix,created_at createdAt,last_used_at lastUsedAt FROM integration_tokens WHERE owner_id=?",
      )
      .bind(ownerId)
      .first<{
        tokenPrefix: string;
        createdAt: string;
        lastUsedAt: string | null;
      }>();
    return NextResponse.json({ active: Boolean(row), ...row });
  } catch (error) {
    return accessErrorResponse(error, "读取自动记账密钥失败");
  }
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    await ensureIntegrationTokenTable();
    const ownerId = await requestOwnerId(request);
    const token = createIntegrationToken();
    const hash = await hashIntegrationToken(token);
    await getDbBinding()
      .prepare(
        `INSERT INTO integration_tokens(owner_id,token_hash,token_prefix)
         VALUES(?,?,?)
         ON CONFLICT(owner_id) DO UPDATE SET
           token_hash=excluded.token_hash,
           token_prefix=excluded.token_prefix,
           created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
           last_used_at=NULL`,
      )
      .bind(ownerId, hash, `${token.slice(0, 12)}…`)
      .run();
    return NextResponse.json({
      active: true,
      token,
      tokenPrefix: `${token.slice(0, 12)}…`,
    });
  } catch (error) {
    return accessErrorResponse(error, "生成自动记账密钥失败");
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    await ensureIntegrationTokenTable();
    const ownerId = await requestOwnerId(request);
    await getDbBinding()
      .prepare("DELETE FROM integration_tokens WHERE owner_id=?")
      .bind(ownerId)
      .run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error, "撤销自动记账密钥失败");
  }
}
