import {
  fetchClientJson,
  MAX_P2P_PACKAGE_RESPONSE_BYTES,
} from "./client-api.ts";

type RequestJson = <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxBytes?: number,
) => Promise<{ response: Response; data: T | null }>;

export type NearbyPeer = { nodeId: string; label: string; lastSeenAt: string };
export type NearbyPackage = { id: string; size: number; createdAt: string };

export function nearbyDiscoveryUrl(room: string, nodeId: string) {
  return `/api/p2p/discovery?room=${encodeURIComponent(room)}&node=${encodeURIComponent(nodeId)}`;
}

export function nearbyPackagesUrl(room: string, packageId?: string) {
  const base = `/api/p2p/packages?room=${encodeURIComponent(room)}`;
  return packageId ? `${base}&id=${encodeURIComponent(packageId)}` : base;
}

export function announceNearbyDevice(input: {
  room: string;
  nodeId: string;
  label: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ error?: string }>("/api/p2p/discovery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room: input.room, nodeId: input.nodeId, label: input.label }),
  });
}

export function discoverNearbyPeers(input: {
  room: string;
  nodeId: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ peers?: NearbyPeer[]; accessUrl?: string }>(
    nearbyDiscoveryUrl(input.room, input.nodeId),
    { cache: "no-store" },
  );
}

export function leaveNearbyDiscovery(input: {
  room: string;
  nodeId: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ error?: string }>(
    nearbyDiscoveryUrl(input.room, input.nodeId),
    { method: "DELETE", keepalive: true },
  );
}

export function listNearbyPackages(input: {
  room: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ packages?: NearbyPackage[] }>(
    nearbyPackagesUrl(input.room),
    { cache: "no-store" },
    MAX_P2P_PACKAGE_RESPONSE_BYTES,
  );
}

export function uploadNearbyPackage(input: {
  room: string;
  payload: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ id?: string; error?: string }>(
    "/api/p2p/packages",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: input.room, payload: input.payload }),
    },
    MAX_P2P_PACKAGE_RESPONSE_BYTES,
  );
}

export function downloadNearbyPackage(input: {
  room: string;
  packageId: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ payload?: string; error?: string }>(
    nearbyPackagesUrl(input.room, input.packageId),
    { cache: "no-store" },
    MAX_P2P_PACKAGE_RESPONSE_BYTES,
  );
}

export function deleteNearbyPackage(input: {
  room: string;
  packageId: string;
  request?: RequestJson;
}) {
  const request = input.request ?? fetchClientJson;
  return request<{ error?: string }>(
    nearbyPackagesUrl(input.room, input.packageId),
    { method: "DELETE" },
    MAX_P2P_PACKAGE_RESPONSE_BYTES,
  );
}
