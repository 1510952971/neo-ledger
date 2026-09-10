import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(projectRoot, "dist", "server");
const clientDir = path.join(projectRoot, "dist", "client");

await mkdir(clientDir, { recursive: true });
await cp(path.join(serverDir, "index.js"), path.join(clientDir, "_worker.js"));
await cp(path.join(serverDir, "index.js"), path.join(clientDir, "index.js"));
await cp(path.join(serverDir, "_next"), path.join(clientDir, "_next"), {
  recursive: true,
});
await cp(path.join(serverDir, "ssr"), path.join(clientDir, "ssr"), {
  recursive: true,
});
await cp(
  path.join(serverDir, "__vite_rsc_assets_manifest.js"),
  path.join(clientDir, "__vite_rsc_assets_manifest.js"),
);
await cp(
  path.join(serverDir, "vinext-client-assets.js"),
  path.join(clientDir, "vinext-client-assets.js"),
);

// Let Cloudflare Pages serve immutable client assets directly. Sending these
// requests through the SSR worker makes vinext interpret them as application
// routes, which results in a 404 and leaves the page without styles/scripts.
await writeFile(
  path.join(clientDir, "_routes.json"),
  `${JSON.stringify(
    {
      version: 1,
      include: ["/*"],
      exclude: ["/_next/static/*", "/favicon.ico"],
    },
    null,
    2,
  )}\n`,
);

console.log("Prepared dist/client for Cloudflare Pages advanced mode.");
