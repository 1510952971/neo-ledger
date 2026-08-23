import { fetchClientJson } from "./client-api.ts";

export type CategoryActionKind = "expense" | "income";

type CategoryResponse = { error?: string };
type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<{ response: Response; data: T | null }>;

export type CategoryActionResult = {
  ok: boolean;
  error?: string;
};

export type SaveCategoryInput = {
  kind: CategoryActionKind;
  ledgerId: number;
  id?: number;
  name: string;
  icon: string;
  color: string;
};

export type CategoryIdentity = {
  kind: CategoryActionKind;
  ledgerId: number;
  id: number;
  name: string;
  icon: string;
  color: string;
};

function endpoint(kind: CategoryActionKind) {
  return kind === "expense" ? "/api/categories" : "/api/income-categories";
}

function result(response: Response, data: CategoryResponse | null, fallback: string): CategoryActionResult {
  return response.ok
    ? { ok: true }
    : { ok: false, error: data?.error || fallback };
}

export async function saveCategory(
  input: SaveCategoryInput,
  request: RequestJson = fetchClientJson,
): Promise<CategoryActionResult> {
  const { response, data } = await request<CategoryResponse>(endpoint(input.kind), {
    method: input.id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: input.id,
      ledgerId: input.ledgerId,
      name: input.name,
      icon: input.icon,
      color: input.color,
      isActive: true,
    }),
  });
  return result(response, data, "保存失败");
}

export async function removeCategory(
  input: Pick<CategoryIdentity, "kind" | "ledgerId" | "id">,
  request: RequestJson = fetchClientJson,
): Promise<CategoryActionResult> {
  const { response, data } = await request<CategoryResponse>(
    `${endpoint(input.kind)}?id=${encodeURIComponent(input.id)}&ledger=${encodeURIComponent(input.ledgerId)}`,
    { method: "DELETE" },
  );
  return result(response, data, "删除失败");
}

export async function restoreCategory(
  input: CategoryIdentity,
  request: RequestJson = fetchClientJson,
): Promise<CategoryActionResult> {
  const { response, data } = await request<CategoryResponse>(endpoint(input.kind), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: input.id,
      ledgerId: input.ledgerId,
      name: input.name,
      icon: input.icon,
      color: input.color,
      isActive: true,
    }),
  });
  return result(response, data, "恢复分类失败");
}
