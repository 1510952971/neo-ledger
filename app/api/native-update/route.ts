import { NextResponse } from "next/server";
import { GITHUB_REPOSITORY } from "../../app-version";
import { compareVersions } from "../../update-rules.js";

type ReleaseAsset = {
  name?: string;
  browser_download_url?: string;
};

type GitHubRelease = {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: ReleaseAsset[];
};

async function latestNativeRelease() {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases?per_page=100`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "neo-ledger-update-mirror",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(`GitHub 版本服务暂时不可用（${response.status}）`);
  const releases = (await response.json()) as unknown;
  if (!Array.isArray(releases)) throw new Error("GitHub 版本响应格式无效");
  const candidates = releases
    .filter((item): item is GitHubRelease => Boolean(item && typeof item === "object"))
    .filter((item) => /^native-v\d+\.\d+\.\d+$/.test(String(item.tag_name ?? "")))
    .filter((item) => item.draft !== true && item.prerelease !== true)
    .sort((left, right) =>
      compareVersions(
        String(right.tag_name).slice("native-v".length),
        String(left.tag_name).slice("native-v".length),
      ),
    );
  return candidates[0] ?? null;
}

function mirrorUrl(request: Request, tag: string, asset: string) {
  const url = new URL("/api/native-update/download", request.url);
  url.searchParams.set("tag", tag);
  url.searchParams.set("asset", asset);
  return url.toString();
}

export async function GET(request: Request) {
  try {
    const release = await latestNativeRelease();
    if (!release) {
      return NextResponse.json({ latestVersion: null, tag: null }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const tag = String(release.tag_name ?? "");
    if (!/^native-v\d+\.\d+\.\d+$/.test(tag))
      throw new Error("原生客户端发布标签无效");
    const githubAssets = Object.fromEntries(
      (release.assets ?? [])
        .filter((asset) => asset.name && asset.browser_download_url)
        .map((asset) => [asset.name as string, asset.browser_download_url as string]),
    );
    const serviceAssets = Object.fromEntries(
      Object.keys(githubAssets).map((name) => [name, mirrorUrl(request, tag, name)]),
    );
    return NextResponse.json(
      {
        currentVersion: null,
        latestVersion: tag.slice("native-v".length),
        tag,
        releaseName: release.name ?? `Neo Ledger ${tag.slice("native-v".length)}`,
        notes: String(release.body ?? "").slice(0, 4000),
        publishedAt: release.published_at ?? null,
        releaseUrl: release.html_url ?? `https://github.com/${GITHUB_REPOSITORY}/releases`,
        githubAssets,
        serviceAssets,
        mirrors: [
          { id: "service", label: "软件服务地址", available: true },
          { id: "github", label: "GitHub Releases", available: true },
        ],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "检查原生客户端更新失败" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
