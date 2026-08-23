import {
  fetchClientJson,
  MAX_WEBDAV_RESPONSE_BYTES,
} from "./client-api.ts";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxBytes?: number,
) => Promise<{ response: Response; data: T | null }>;

export type WebDavCredentials = {
  url: string;
  username: string;
  password: string;
};

export function uploadWebDavSnapshot(input: {
  credentials: WebDavCredentials;
  payload: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ error?: string }>("/api/webdav-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input.credentials,
      action: "upload",
      payload: input.payload,
    }),
  });
}

export function downloadWebDavSnapshot(input: {
  credentials: WebDavCredentials;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ payload?: string; error?: string }>(
    "/api/webdav-sync",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input.credentials, action: "download" }),
    },
    MAX_WEBDAV_RESPONSE_BYTES,
  );
}
