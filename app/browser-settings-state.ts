import { useEffect, useState } from "react";
import { restoreBrowserState } from "./browser-state.js";
import { createClientId } from "./client-id.js";

export type WebdavConfig = {
  url: string;
  username: string;
  autoSync: boolean;
  intervalMinutes: number;
};

export type WebdavSession = { password: string; secret: string };

export function useBrowserSettingsState({
  setP2pNode,
}: {
  setP2pNode: (node: string) => void;
}) {
  const [webdavConfig, setWebdavConfig] = useState<WebdavConfig>({
    url: "",
    username: "",
    autoSync: false,
    intervalMinutes: 5,
  });
  const [webdavSession, setWebdavSession] = useState<WebdavSession>({
    password: "",
    secret: "",
  });
  const [browserStateReady, setBrowserStateReady] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const browserState = restoreBrowserState({
        storage: localStorage,
        online: navigator.onLine,
        createNodeId: createClientId,
      }) as {
        webdavConfig: WebdavConfig;
        p2pNode: string;
      };
      setWebdavConfig(browserState.webdavConfig);
      setP2pNode(browserState.p2pNode);
      try {
        setWebdavSession({
          password: sessionStorage.getItem("neo-webdav-password") || "",
          secret: sessionStorage.getItem("neo-webdav-secret") || "",
        });
      } catch {
        setWebdavSession({ password: "", secret: "" });
      }
      setBrowserStateReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [setP2pNode]);

  useEffect(() => {
    if (!browserStateReady) return;
    localStorage.setItem("neo-webdav-config", JSON.stringify(webdavConfig));
  }, [browserStateReady, webdavConfig]);

  return {
    browserStateReady,
    webdavConfig,
    setWebdavConfig,
    webdavSession,
    setWebdavSession,
  };
}
