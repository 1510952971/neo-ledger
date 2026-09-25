import { NextResponse } from "next/server";
import { ensureDb, getDbBinding } from "../../../db";
import { accessErrorResponse, claimAndRequireLedger, guardedApiResponse } from "../../api-security";
import { recordAuditEvent, requestIdFromRequest } from "../../audit-log";
import { readTagDeleteInput, readTagRenameInput } from "../../internal-api-contract";

export const dynamic = "force-dynamic";

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

type TagCount = { name: string; count: number };

function parseTags(raw: unknown) {
  if (typeof raw !== "string") return [] as string[];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [] as string[];
    return value
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter(Boolean);
  } catch {
    return [] as string[];
  }
}

async function loadTagRows(ledgerId: number) {
  const rows = await getDbBinding()
    .prepare("SELECT id,tags_json tagsJson FROM transactions WHERE ledger_id=? AND tags_json IS NOT NULL")
    .bind(ledgerId)
    .all<{ id: number; tagsJson: string | null }>();
  return rows.results.map((row) => ({ id: Number(row.id), tags: parseTags(row.tagsJson) }));
}

function summarizeTags(rows: Array<{ tags: string[] }>): TagCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of new Set(row.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN"));
}

async function updateRows(
  rows: Array<{ id: number; tags: string[] }>,
  transform: (tags: string[]) => string[] | null,
) {
  const db = getDbBinding();
  const statements = rows
    .map((row) => {
      const next = transform(row.tags);
      return next == null || JSON.stringify(next) === JSON.stringify(row.tags)
        ? null
        : db.prepare("UPDATE transactions SET tags_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(JSON.stringify(next), row.id);
    })
    .filter((statement): statement is ReturnType<typeof db.prepare> => statement != null);
  let updated = 0;
  for (let index = 0; index < statements.length; index += 50) {
    const result = await db.batch(statements.slice(index, index + 50));
    updated += result.reduce((sum, item) => sum + Number(item.meta.changes ?? 0), 0);
  }
  return updated;
}

export async function GET(request: Request) {
  return guardedApiResponse(request, "读取标签词库失败", async () => {
    await ensureDb();
    const ledgerId = Number(new URL(request.url).searchParams.get("ledger") || 1);
    await claimAndRequireLedger(request, ledgerId);
    const tags = summarizeTags(await loadTagRows(ledgerId));
    return privateJson({ tags });
  });
}

export async function PATCH(request: Request) {
  try {
    await ensureDb();
    const body = await readTagRenameInput(request);
    const ownerId = await claimAndRequireLedger(request, body.ledgerId);
    const rows = await loadTagRows(body.ledgerId);
    const updated = await updateRows(rows, (tags) => {
      if (!tags.includes(body.from)) return tags;
      return [...new Set(tags.map((tag) => (tag === body.from ? body.to : tag)))];
    });
    await recordAuditEvent({
      ownerId,
      eventType: "transaction.tag_rename",
      subjectType: "ledger",
      subjectId: body.ledgerId,
      requestId: requestIdFromRequest(request),
      metadata: { from: body.from, to: body.to, updated },
    });
    return privateJson({ ok: true, updated, name: body.to });
  } catch (error) {
    return accessErrorResponse(error, "重命名标签失败", request);
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();
    const body = await readTagDeleteInput(request);
    const ownerId = await claimAndRequireLedger(request, body.ledgerId);
    const rows = await loadTagRows(body.ledgerId);
    const updated = await updateRows(rows, (tags) => {
      if (!tags.includes(body.name)) return tags;
      return tags.filter((tag) => tag !== body.name);
    });
    await recordAuditEvent({
      ownerId,
      eventType: "transaction.tag_delete",
      subjectType: "ledger",
      subjectId: body.ledgerId,
      requestId: requestIdFromRequest(request),
      metadata: { name: body.name, updated },
    });
    return privateJson({ ok: true, updated, name: body.name });
  } catch (error) {
    return accessErrorResponse(error, "删除标签失败", request);
  }
}
