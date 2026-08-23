import { fetchClientJson } from "./client-api.ts";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxBytes?: number,
) => Promise<{ response: Response; data: T | null }>;

export function createMember<Member extends { id?: number }>(input: {
  ledgerId: number;
  name: string;
  icon: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<Member & { error?: string }>(
    "/api/members",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ledgerId: input.ledgerId,
        name: input.name,
        icon: input.icon,
      }),
    },
  );
}
