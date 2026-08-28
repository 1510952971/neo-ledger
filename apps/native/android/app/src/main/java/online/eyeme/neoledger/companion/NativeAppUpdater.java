package online.eyeme.neoledger.companion;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Downloads a native-v* Android release and hands it to the system installer.
 *
 * The Flutter client does the release/version selection. This class is kept
 * Android-only because only Android can install an APK from inside the app.
 * Downloads are restricted to GitHub release URLs and verified against the
 * SHA256SUMS.txt asset emitted by the native release workflow.
 */
public final class NativeAppUpdater {
    private static final long MAX_APK_BYTES = 150L * 1024 * 1024;
    private static final long MAX_CHECKSUM_BYTES = 64 * 1024;
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    public interface Callback {
        void complete(Result result);
    }

    public static final class Result {
        public final boolean ok;
        public final boolean installed;
        public final String version;
        public final String message;

        Result(boolean ok, boolean installed, String version, String message) {
            this.ok = ok;
            this.installed = installed;
            this.version = version;
            this.message = message;
        }

        public Map<String, Object> asMap() {
            Map<String, Object> map = new HashMap<>();
            map.put("ok", ok);
            map.put("installed", installed);
            map.put("version", version);
            map.put("message", message);
            return map;
        }
    }

    private NativeAppUpdater() {}

    public static void downloadAndInstall(Context context, String version, String apkUrl,
                                           String checksumManifestUrl, String apkName,
                                           Callback callback) {
        Context app = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            Result result;
            try {
                String safeName = safeApkName(apkName, apkUrl);
                File apk = downloadApk(app, apkUrl, safeName);
                if (checksumManifestUrl != null && !checksumManifestUrl.trim().isEmpty()) {
                    String expected = readExpectedChecksum(checksumManifestUrl, safeName);
                    String actual = sha256(apk);
                    if (!expected.equalsIgnoreCase(actual)) {
                        if (!apk.delete()) apk.deleteOnExit();
                        throw new Exception("APK 校验失败，已拒绝安装");
                    }
                }
                install(app, apk);
                result = new Result(true, true, version, "新版已下载，已交给系统安装");
            } catch (Exception error) {
                result = new Result(false, false, version,
                        "下载或安装更新失败：" + safeMessage(error));
            }
            post(app, callback, result);
        });
    }

    private static File downloadApk(Context context, String apkUrl, String apkName) throws Exception {
        if (!trustedGitHubUrl(apkUrl)) throw new Exception("更新地址不是可信 GitHub 地址");
        File directory = new File(context.getCacheDir(), "updates");
        if (!directory.exists() && !directory.mkdirs()) throw new Exception("无法创建更新目录");
        File target = new File(directory, "neo-ledger-update.apk");
        File temporary = new File(directory, "neo-ledger-update.apk.part");
        if (temporary.exists() && !temporary.delete()) throw new Exception("无法清理未完成的更新");

        HttpURLConnection connection = open(apkUrl);
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new Exception("APK 下载返回 " + status);
            long length = connection.getContentLengthLong();
            if (length > MAX_APK_BYTES) throw new Exception("APK 文件过大");
            try (InputStream input = connection.getInputStream();
                 OutputStream output = new FileOutputStream(temporary)) {
                byte[] buffer = new byte[16 * 1024];
                int count;
                long total = 0;
                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    if (total > MAX_APK_BYTES) throw new Exception("APK 文件过大");
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
        return target;
    }

    private static void install(Context context, File apk) throws Exception {
        if (Build.VERSION.SDK_INT >= 26 && !context.getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + context.getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(settings);
            throw new SecurityException("请允许 Neo Ledger 安装未知应用，然后重新点击安装");
        }
        Uri uri = NeoApkFileProvider.uriForFile(context, apk);
        Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private static String readExpectedChecksum(String checksumUrl, String apkName) throws Exception {
        if (!trustedGitHubUrl(checksumUrl)) throw new Exception("校验文件不是可信 GitHub 地址");
        HttpURLConnection connection = open(checksumUrl);
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new Exception("校验文件下载返回 " + status);
            String text = read(connection.getInputStream(), (int) MAX_CHECKSUM_BYTES);
            String normalizedName = apkName.toLowerCase(Locale.ROOT);
            for (String line : text.split("\\r?\\n")) {
                String[] parts = line.trim().split("\\s+", 2);
                if (parts.length == 2 && parts[1].trim().toLowerCase(Locale.ROOT).equals(normalizedName)) {
                    String value = parts[0].toLowerCase(Locale.ROOT);
                    if (!value.matches("[0-9a-f]{64}")) throw new Exception("校验文件格式无效");
                    return value;
                }
            }
            throw new Exception("校验文件中找不到 APK 条目");
        } finally {
            connection.disconnect();
        }
    }

    private static String safeApkName(String requestedName, String apkUrl) throws Exception {
        String value = requestedName == null ? "" : requestedName.trim();
        if (value.isEmpty()) {
            String path = new URL(apkUrl).getPath();
            value = URLDecoder.decode(path.substring(path.lastIndexOf('/') + 1), "UTF-8");
        }
        if (!value.matches("neo-ledger-android-[0-9]+\\.[0-9]+\\.[0-9]+\\.apk")) {
            throw new Exception("更新包名称无效");
        }
        return value;
    }

    private static boolean trustedGitHubUrl(String value) {
        return value != null && (value.startsWith("https://github.com/")
                || value.startsWith("https://objects.githubusercontent.com/"));
    }

    private static HttpURLConnection open(String value) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(value).openConnection();
        connection.setInstanceFollowRedirects(true);
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(90_000);
        connection.setRequestProperty("Accept", "application/octet-stream");
        connection.setRequestProperty("User-Agent", "NeoLedger-Android/1.2");
        return connection;
    }

    private static String read(InputStream input, int max) throws Exception {
        if (input == null) return "";
        byte[] buffer = new byte[8192];
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (output.size() + count > max) throw new Exception("校验响应过大");
            output.write(buffer, 0, count);
        }
        return output.toString(StandardCharsets.UTF_8.name());
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[16 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        StringBuilder result = new StringBuilder();
        for (byte value : digest.digest()) result.append(String.format("%02x", value));
        return result.toString();
    }

    private static void post(Context context, Callback callback, Result result) {
        new Handler(Looper.getMainLooper()).post(() -> callback.complete(result));
    }

    private static String safeMessage(Exception error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }
}
