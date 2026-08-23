import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { APP_VERSION, GITHUB_REPOSITORY } from "../../app-version";
import {
  compareVersions,
  normalizeReleaseTag,
} from "../../update-rules.js";
import { ApiAccessError, accessErrorResponse } from "../../api-security";
import { requestIdFromRequest } from "../../audit-log";
import { readAppUpdateInput } from "../../internal-api-contract";
import {
  fetchWithTimeout,
  readResponseTextWithLimit,
} from "../../request-limits";

type GitHubRelease = {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
};

async function boundedJson<T>(response: Response, label: string, maximum: number) {
  let text: string;
  try {
    text = await readResponseTextWithLimit(response, maximum);
  } catch {
    throw new ApiAccessError(`${label}响应过大或读取失败`, 502);
  }
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not object");
    return value as T;
  } catch {
    throw new ApiAccessError(`${label}响应格式无效`, 502);
  }
}

async function boundedFetch(input: RequestInfo | URL, init: RequestInit) {
  try {
    return await fetchWithTimeout(input, init, 15_000);
  } catch (error) {
    if (error instanceof ApiAccessError) throw error;
    throw new ApiAccessError("外部版本服务连接失败", 502);
  }
}

function runtimeConfig() {
  const runtime = env as unknown as Record<string, unknown>;
  return {
    repository: String(runtime.NEO_GITHUB_REPOSITORY || GITHUB_REPOSITORY),
    token: String(runtime.NEO_UPDATER_TOKEN || ""),
  };
}

function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

async function latestRelease(repository: string) {
  const response = await boundedFetch(
    `https://api.github.com/repos/${repository}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "neo-ledger-updater",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    },
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`GitHub 版本服务暂时不可用（${response.status}）`);
  const release = await boundedJson<GitHubRelease>(response, "GitHub 版本服务", 512 * 1024);
  if (release.draft || release.prerelease) return null;
  return release;
}

export async function GET(request: Request) {
  try {
    const config = runtimeConfig();
    const release = await latestRelease(config.repository);
    const tag = normalizeReleaseTag(release?.tag_name);
    const latestVersion = tag?.slice(1) ?? APP_VERSION;
    return NextResponse.json(
      {
        currentVersion: APP_VERSION,
        latestVersion,
        tag,
        available: Boolean(tag && compareVersions(latestVersion, APP_VERSION) > 0),
        releaseName: release?.name || tag || `v${APP_VERSION}`,
        notes: String(release?.body || "").slice(0, 4000),
        publishedAt: release?.published_at ?? null,
        releaseUrl:
          release?.html_url ??
          `https://github.com/${config.repository}/releases`,
        canApply: isLocalRequest(request) && Boolean(config.token),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return accessErrorResponse(error, "检查更新失败", request);
  }
}
export async function POST(request: Request) {
  try {
    if (!isLocalRequest(request))
      return accessErrorResponse(
        new ApiAccessError("一键更新仅允许在本机程序中执行", 403),
        "启动更新失败",
        request,
      );
    const config = runtimeConfig();
    if (!config.token)
      throw new Error("本地更新服务尚未启动，请重新运行 npm run dev");
    const body = await readAppUpdateInput(request);
    const tag = normalizeReleaseTag(body.tag);
    if (!tag) throw new Error("更新版本无效");
    const release = await latestRelease(config.repository);
    if (normalizeReleaseTag(release?.tag_name) !== tag)
      throw new Error("该版本不是当前 GitHub 正式最新版");
    if (compareVersions(tag.slice(1), APP_VERSION) <= 0)
      throw new Error("当前已经是最新版");
    const response = await boundedFetch("http://127.0.0.1:3210/apply", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tag }),
    });
    const result = await boundedJson<{
      ok?: boolean;
      error?: string;
      backupPath?: string;
    }>(response, "本地更新服务", 64 * 1024);
    if (!response.ok) throw new Error(result.error || "更新服务执行失败");
    return NextResponse.json(
      {
        ok: true,
        tag,
        backupCreated: Boolean(result.backupPath),
        message: "更新包已验证，程序即将重启",
      },
      {
        status: 202,
        headers: {
          "Cache-Control": "no-store, private, max-age=0",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
          "X-Request-ID": requestIdFromRequest(request),
        },
      },
    );
  } catch (error) {
    return accessErrorResponse(error, "启动更新失败", request);
  }
}
