import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { APP_VERSION, GITHUB_REPOSITORY } from "../../app-version";
import {
  compareVersions,
  normalizeReleaseTag,
} from "../../update-rules.js";
import { accessErrorResponse } from "../../api-security";

type GitHubRelease = {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
};

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
  const response = await fetch(
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
  const release = (await response.json()) as GitHubRelease;
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
    return accessErrorResponse(error, "检查更新失败");
  }
}
export async function POST(request: Request) {
  try {
    if (!isLocalRequest(request))
      return NextResponse.json(
        { error: "一键更新仅允许在本机程序中执行" },
        { status: 403 },
      );
    const config = runtimeConfig();
    if (!config.token)
      throw new Error("本地更新服务尚未启动，请重新运行 npm run dev");
    const body = (await request.json()) as { tag?: string };
    const tag = normalizeReleaseTag(body.tag);
    if (!tag) throw new Error("更新版本无效");
    const release = await latestRelease(config.repository);
    if (normalizeReleaseTag(release?.tag_name) !== tag)
      throw new Error("该版本不是当前 GitHub 正式最新版");
    if (compareVersions(tag.slice(1), APP_VERSION) <= 0)
      throw new Error("当前已经是最新版");
    const response = await fetch("http://127.0.0.1:3210/apply", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tag }),
    });
    const result = (await response.json()) as {
      ok?: boolean;
      error?: string;
      backupPath?: string;
    };
    if (!response.ok) throw new Error(result.error || "更新服务执行失败");
    return NextResponse.json(
      {
        ok: true,
        tag,
        backupCreated: Boolean(result.backupPath),
        message: "更新包已验证，程序即将重启",
      },
      { status: 202 },
    );
  } catch (error) {
    return accessErrorResponse(error, "启动更新失败");
  }
}
