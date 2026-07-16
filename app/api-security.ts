import { ensureDb, getDbBinding } from "../db";

export class ApiAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function requestOwnerId(request: Request) {
  const email = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  if (email) return `email:${email}`;
  if (isLocalHost(new URL(request.url).hostname)) return "local";
  throw new ApiAccessError("请先登录后再访问账本", 401);
}

export async function claimAndRequireLedger(request: Request, ledgerId: number) {
  if (!Number.isInteger(ledgerId) || ledgerId <= 0)
    throw new ApiAccessError("账本不存在", 400);
  await ensureDb();
  const ownerId = requestOwnerId(request);
  await claimLedgerForOwner(ownerId, ledgerId);
  return ownerId;
}

export async function claimLedgerForOwner(ownerId: string, ledgerId: number) {
  if (!ownerId) throw new ApiAccessError("接口身份未绑定账本所有者", 401);
  if (!Number.isInteger(ledgerId) || ledgerId <= 0)
    throw new ApiAccessError("账本不存在", 400);
  await ensureDb();
  const db = getDbBinding();
  await db
    .prepare("UPDATE ledgers SET owner_id=? WHERE id=? AND owner_id IS NULL")
    .bind(ownerId, ledgerId)
    .run();
  const owned = await db
    .prepare("SELECT id FROM ledgers WHERE id=? AND owner_id=?")
    .bind(ledgerId, ownerId)
    .first();
  if (!owned) throw new ApiAccessError("无权访问这个账本", 403);
}

export async function getOwnerPreferences(ownerId: string) {
  await ensureDb();
  const db = getDbBinding();
  await db
    .prepare(
      "INSERT OR IGNORE INTO user_preferences(owner_id,theme,lock_enabled) SELECT ?,theme,lock_enabled FROM app_preferences WHERE id=1",
    )
    .bind(ownerId)
    .run();
  await db
    .prepare("INSERT OR IGNORE INTO user_preferences(owner_id) VALUES(?)")
    .bind(ownerId)
    .run();
  return db
    .prepare(
      "SELECT theme,lock_enabled AS lockEnabled,pin_hash AS pinHash,pin_salt AS pinSalt,pin_iterations AS pinIterations FROM user_preferences WHERE owner_id=?",
    )
    .bind(ownerId)
    .first<{
      theme: string;
      lockEnabled: number;
      pinHash: string | null;
      pinSalt: string | null;
      pinIterations: number;
    }>();
}

export function accessErrorResponse(error: unknown, fallback: string) {
  const status = error instanceof ApiAccessError ? error.status : 400;
  return Response.json(
    { error: error instanceof Error ? error.message : fallback },
    { status },
  );
}
