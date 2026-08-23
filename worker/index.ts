/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { evaluateDeploymentSecurity } from "../app/deployment-security";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  DEPLOYMENT_MODE?: string;
  NEO_HSTS?: string;
  NEO_ALLOWED_HOSTS?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const deployment = evaluateDeploymentSecurity(env as unknown as Record<string, unknown>, request.url);
    if (!deployment.secure && String(env.DEPLOYMENT_MODE || "local") === "cloud")
      return Response.json(
        {
          error: "cloud 部署安全配置未通过",
          code: "insecure_deployment_configuration",
          issues: deployment.blocking.map((issue) => issue.code),
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    if (String(env.DEPLOYMENT_MODE || "local") === "cloud") {
      const hardened = new Response(response.body, response);
      hardened.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      return hardened;
    }
    return response;
  },
};

export default worker;
