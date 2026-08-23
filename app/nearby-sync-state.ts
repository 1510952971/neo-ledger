"use client";

import { useEffect, useState, type SetStateAction } from "react";
import {
  announceNearbyDevice,
  discoverNearbyPeers,
  leaveNearbyDiscovery,
  listNearbyPackages,
  type NearbyPackage,
  type NearbyPeer,
} from "./nearby-actions.ts";

export type { NearbyPackage, NearbyPeer } from "./nearby-actions.ts";
export type NearbyDownload = { url: string; name: string };
export { nearbyDiscoveryUrl, nearbyPackagesUrl } from "./nearby-actions.ts";

export function normalizePairingCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8);
}

export function useNearbySyncState({ active, room }: { active: boolean; room: string }) {
  const [pairingCode, setPairingCode] = useState("");
  const [receiveCode, setReceiveCode] = useState("");
  const [status, setStatus] = useState("等待生成或接收同步包");
  const [download, setDownload] = useState<NearbyDownload | null>(null);
  const [packages, setPackages] = useState<NearbyPackage[]>([]);
  const [packageId, setPackageId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [accessUrl, setAccessUrl] = useState("");
  const [addressRefreshKey, setAddressRefreshKey] = useState(0);
  const [node, setNode] = useState("");
  const [peers, setPeers] = useState<NearbyPeer[]>([]);

  useEffect(() => () => {
    if (download) URL.revokeObjectURL(download.url);
  }, [download]);

  useEffect(() => {
    if (!active || !node || !room) return;
    let current = true;
    const announce = async () => {
      try {
        const label = `${navigator.platform || "浏览器设备"} · ${node.slice(-8)}`;
        const { response: heartbeat } = await announceNearbyDevice({
          room,
          nodeId: node,
          label,
        });
        if (!heartbeat.ok) return;
        const { response, data } = await discoverNearbyPeers({ room, nodeId: node });
        if (!response.ok || !current) return;
        setPeers(data?.peers ?? []);
        setAccessUrl(data?.accessUrl ?? window.location.origin);
      } catch {
        if (current) setStatus("设备发现暂时不可用，请使用局域网同步包");
      }
    };
    void announce();
    const timer = window.setInterval(() => void announce(), 8_000);
    const refresh = () => void announce();
    window.addEventListener("focus", refresh);
    return () => {
      current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      setPeers([]);
      setAccessUrl("");
      void leaveNearbyDiscovery({ room, nodeId: node }).catch(() => undefined);
    };
  }, [active, addressRefreshKey, node, room]);

  useEffect(() => {
    if (!active || !room) return;
    let current = true;
    const poll = async () => {
      try {
        const { response, data } = await listNearbyPackages({ room });
        if (!response.ok || !current) return;
        setPackages(data?.packages ?? []);
      } catch {}
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5_000);
    return () => {
      current = false;
      window.clearInterval(timer);
      setPackages([]);
    };
  }, [active, room]);

  return {
    pairingCode, setPairingCode,
    receiveCode, setReceiveCode: (value: SetStateAction<string>) => setReceiveCode((current) => normalizePairingCode(typeof value === "function" ? value(current) : value)),
    status, setStatus,
    download, setDownload,
    packages, setPackages,
    packageId, setPackageId,
    uploading, setUploading,
    accessUrl,
    refreshAddress: () => setAddressRefreshKey((value) => value + 1),
    node, setNode,
    peers,
  };
}
