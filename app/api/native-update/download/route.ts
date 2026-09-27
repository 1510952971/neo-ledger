import { NextResponse } from "next/server";
import { GITHUB_REPOSITORY } from "../../../app-version";

type ReleaseAsset = { name?: string; url?: string; browser_download_url?: string };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tag = url.searchParams.get("tag") ?? "";
  const assetName = url.searchParams.get("asset") ?? "";
  if (!/^native-v\d+\.\d+\.\d+$/.test(tag) ||
      !/^(neo-ledger-[a-z0-9.-]+\.(apk|aab|dmg|zip|exe|msix|msixbundle|tar\.gz)|SHA256SUMS\.txt|RELEASE_STATUS\.json)$/.test(assetName)) {
    return NextResponse.json({ error: "更新包参数无效" }, { status: 400 });
  }
  try {
    const releaseResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/tags/${tag}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "neo-ledger-update-mirror",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      },
    );
    if (!releaseResponse.ok) {
      return NextResponse.json({ error: "更新包版本不存在" }, { status: 404 });
    }
    const release = (await releaseResponse.json()) as { assets?: ReleaseAsset[] };
    const asset = (release.assets ?? []).find((item) => item.name === assetName);
    if (!asset?.browser_download_url) {
      return NextResponse.json({ error: "更新包不存在" }, { status: 404 });
    }
    const packageResponse = await fetch(asset.browser_download_url, {
      headers: {
        Accept: "application/octet-stream",
        "User-Agent": "neo-ledger-update-mirror",
      },
      cache: "no-store",
    });
    if (!packageResponse.ok || !packageResponse.body) {
      return NextResponse.json({ error: "更新包下载失败" }, { status: 502 });
    }
    return new NextResponse(packageResponse.body, {
      status: 200,
      headers: {
        "Content-Type": packageResponse.headers.get("content-type") ?? "application/octet-stream",
        "Content-Length": packageResponse.headers.get("content-length") ?? "",
        "Content-Disposition": `attachment; filename="${assetName}"`,
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新包下载失败" },
      { status: 502 },
    );
  }
}
