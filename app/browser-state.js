export function restoreBrowserState({ storage, online, createNodeId }) {
  let webdavConfig = { url: "", username: "" };
  try {
    const saved = JSON.parse(storage.getItem("neo-webdav-config") || "{}");
    webdavConfig = {
      url: String(saved?.url || ""),
      username: String(saved?.username || ""),
    };
  } catch {
    webdavConfig = { url: "", username: "" };
  }

  let p2pNode = "";
  try {
    p2pNode = String(storage.getItem("neo-p2p-node") || "");
  } catch {
    // Storage can be unavailable in strict private-browsing modes.
  }
  if (!p2pNode) p2pNode = `node-${createNodeId().slice(0, 8)}`;
  try {
    storage.setItem("neo-p2p-node", p2pNode);
  } catch {
    // The generated in-memory identity still supports the current session.
  }

  return {
    isOnline: Boolean(online),
    webdavConfig,
    p2pNode,
  };
}
