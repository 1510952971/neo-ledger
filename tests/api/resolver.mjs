import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers")
    return { shortCircuit: true, url: new URL("./shim-cloudflare-workers.mjs", import.meta.url).href };
  if (specifier === "next/server")
    return { shortCircuit: true, url: new URL("./shim-next-server.mjs", import.meta.url).href };
  if (specifier === "server-only" || specifier === "client-only")
    return { shortCircuit: true, url: "data:text/javascript,export {}" };
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if ((specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
      for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        const candidate = new URL(specifier + suffix, context.parentURL);
        if (existsSync(fileURLToPath(candidate)))
          return { shortCircuit: true, url: candidate.href };
      }
    }
    throw error;
  }
}
