package online.eyeme.neoledger.companion;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class AppUpdater {
    private static final String RELEASES_URL =
            "https://api.github.com/repos/1510952971/neo-ledger/releases?per_page=20";
    private static final String APK_PREFIX = "neo-ledger-android-v";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    static final class Result {
        final boolean ok;
        final boolean available;
        final boolean downloaded;
        final String version;
        final String message;
        final File apk;
        final Release release;

        Result(boolean ok, boolean available, boolean downloaded, String version,
               String message, File apk, Release release) {
            this.ok = ok;
            this.available = available;
            this.downloaded = downloaded;
            this.version = version;
            this.message = message;
            this.apk = apk;
            this.release = release;
        }
    }

    static final class Release {
        final String version;
        final String notes;
        final String apkUrl;
        final String sha256Url;

        Release(String version, String notes, String apkUrl, String sha256Url) {
            this.version = version;
            this.notes = notes;
            this.apkUrl = apkUrl;
            this.sha256Url = sha256Url;
        }
    }

    static void check(Context context, AppUpdateCallback callback) {
        Context app = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            Result result;
            try {
                Release release = latestRelease();
                if (release == null) {
                    result = new Result(true, false, false, BuildConfig.VERSION_NAME,
                            "当前已是最新版", null, null);
                } else {
                    result = new Result(true, true, false, release.version,
                            "发现新版 v" + release.version, null, release);
                }
            } catch (Exception error) {
                result = failure("检查更新失败：" + safeMessage(error));
            }
            post(app, callback, result);
        });
    }

    static void download(Context context, Release release, AppUpdateCallback callback) {
        Context app = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            Result result;
            try {
                File apk = downloadRelease(app, release);
                result = new Result(true, true, true, release.version,
                        "新版已下载，准备安装", apk, release);
            } catch (Exception error) {
                result = failure("下载更新失败：" + safeMessage(error));
            }
            post(app, callback, result);
        });
    }

    static void install(Context context, File apk) throws Exception {
        if (Build.VERSION.SDK_INT >= 26 && !context.getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + context.getPackageName()));
            context.startActivity(settings);
            throw new SecurityException("请允许 Neo Ledger 安装未知应用，然后重新点击安装");
        }
        Uri uri = NeoApkFileProvider.uriForFile(context, apk);
        Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE)
                .setData(uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private static Release latestRelease() throws Exception {
        JSONObject[] releases = readReleaseList();
        Release best = null;
        for (JSONObject release : releases) {
            if (release.optBoolean("draft") || release.optBoolean("prerelease")) continue;
            String tag = release.optString("tag_name", "");
            String version = androidVersion(tag);
            if (version == null || !isNewer(version, BuildConfig.VERSION_NAME)) continue;
            JSONObject apk = findAsset(release.optJSONArray("assets"), ".apk");
            if (apk == null) continue;
            JSONObject checksum = findAsset(release.optJSONArray("assets"), ".sha256");
            Release candidate = new Release(
                    version,
                    release.optString("body", ""),
                    apk.optString("browser_download_url", ""),
                    checksum == null ? "" : checksum.optString("browser_download_url", ""));
            if (!candidate.apkUrl.isEmpty() && (best == null || isNewer(candidate.version, best.version)))
                best = candidate;
        }
        return best;
    }

    private static JSONObject[] readReleaseList() throws Exception {
        HttpURLConnection connection = open(RELEASES_URL);
        try {
            int status = connection.getResponseCode();
            String text = read(status >= 400 ? connection.getErrorStream() : connection.getInputStream(), 512 * 1024);
            if (status < 200 || status >= 300) throw new Exception("GitHub 返回 " + status);
            JSONArray array = new JSONArray(text);
            JSONObject[] result = new JSONObject[array.length()];
            for (int i = 0; i < array.length(); i++) result[i] = array.getJSONObject(i);
            return result;
        } finally {
            connection.disconnect();
        }
    }

    private static File downloadRelease(Context context, Release release) throws Exception {
        if (!release.apkUrl.startsWith("https://github.com/")
                && !release.apkUrl.startsWith("https://objects.githubusercontent.com/"))
            throw new Exception("更新地址不是可信 GitHub 地址");
        File directory = new File(context.getCacheDir(), "updates");
        if (!directory.exists() && !directory.mkdirs()) throw new Exception("无法创建更新目录");
        File target = new File(directory, "neo-ledger-update.apk");
        File temporary = new File(directory, "neo-ledger-update.apk.part");
        HttpURLConnection connection = open(release.apkUrl);
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new Exception("APK 下载返回 " + status);
            long length = connection.getContentLengthLong();
            if (length > 100L * 1024 * 1024) throw new Exception("APK 文件过大");
            try (InputStream input = connection.getInputStream(); OutputStream output = new java.io.FileOutputStream(temporary)) {
                byte[] buffer = new byte[8192];
                int count;
                long total = 0;
                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    if (total > 100L * 1024 * 1024) throw new Exception("APK 文件过大");
                    output.write(buffer, 0, count);
                }
            }
        } finally {
            connection.disconnect();
        }
        if (!temporary.renameTo(target)) {
            if (target.exists() && !target.delete()) throw new Exception("无法替换旧更新包");
            if (!temporary.renameTo(target)) throw new Exception("无法保存更新包");
        }
        if (!release.sha256Url.isEmpty()) {
            String expected = readChecksum(release.sha256Url);
            if (!expected.equalsIgnoreCase(sha256(target))) {
                if (!target.delete()) target.deleteOnExit();
                throw new Exception("APK 校验失败，已拒绝安装");
            }
        }
        return target;
    }

    private static String readChecksum(String url) throws Exception {
        HttpURLConnection connection = open(url);
        try {
            int status = connection.getResponseCode();
            String text = read(connection.getInputStream(), 4096);
            if (status < 200 || status >= 300) throw new Exception("校验文件下载失败");
            String value = text.trim().split("\\s+")[0].toLowerCase(Locale.ROOT);
            if (!value.matches("[0-9a-f]{64}")) throw new Exception("校验文件格式无效");
            return value;
        } finally {
            connection.disconnect();
        }
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder result = new StringBuilder();
        for (byte value : digest.digest()) result.append(String.format("%02x", value));
        return result.toString();
    }

    private static JSONObject findAsset(JSONArray assets, String suffix) {
        if (assets == null) return null;
        JSONObject fallback = null;
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.optJSONObject(i);
            String name = asset == null ? "" : asset.optString("name", "").toLowerCase(Locale.ROOT);
            if (!name.endsWith(suffix)) continue;
            if (name.startsWith(APK_PREFIX)) return asset;
            if (fallback == null) fallback = asset;
        }
        return fallback;
    }

    private static String androidVersion(String tag) {
        if (tag == null || !tag.startsWith("android-v")) return null;
        String value = tag.substring("android-v".length());
        return value.matches("\\d+\\.\\d+\\.\\d+") ? value : null;
    }

    private static boolean isNewer(String left, String right) {
        String[] a = left.split("\\."), b = right.split("\\.");
        for (int i = 0; i < 3; i++) {
            int av = Integer.parseInt(a[i]), bv = Integer.parseInt(b[i]);
            if (av != bv) return av > bv;
        }
        return false;
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(60_000);
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        connection.setRequestProperty("User-Agent", "NeoLedger-Android/1.1");
        return connection;
    }

    private static String read(InputStream input, int max) throws Exception {
        if (input == null) return "";
        byte[] buffer = new byte[8192];
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (output.size() + count > max) throw new Exception("响应过大");
            output.write(buffer, 0, count);
        }
        return output.toString(StandardCharsets.UTF_8.name());
    }

    private static Result failure(String message) {
        return new Result(false, false, false, BuildConfig.VERSION_NAME, message, null, null);
    }

    private static void post(Context context, AppUpdateCallback callback, Result result) {
        new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> callback.complete(result));
    }

    private static String safeMessage(Exception error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }

    private AppUpdater() {}
}
