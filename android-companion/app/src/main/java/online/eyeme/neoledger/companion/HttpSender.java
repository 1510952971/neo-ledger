package online.eyeme.neoledger.companion;

import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class HttpSender {
    interface Callback { void complete(boolean ok, String message); }

    static final class Result {
        final boolean ok;
        final boolean retryable;
        final boolean duplicate;
        final String message;

        Result(boolean ok, boolean retryable, boolean duplicate, String message) {
            this.ok = ok;
            this.retryable = retryable;
            this.duplicate = duplicate;
            this.message = message;
        }
    }

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    static void send(Context context, String text, String source, String externalId, Callback callback) {
        sendNowAsync(context, text, source, externalId, ApiTime.now(), callback);
    }

    static void sendNowAsync(
            Context context, String text, String source, String externalId, String occurredAt, Callback callback) {
        Context app = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            Result result = sendNow(app, text, source, externalId, occurredAt);
            new SettingsStore(app).status(result.message);
            app.sendBroadcast(new Intent(SettingsStore.ACTION_STATUS).setPackage(app.getPackageName()));
            if (callback != null) {
                new Handler(Looper.getMainLooper()).post(() -> callback.complete(result.ok, result.message));
            }
        });
    }

    static Result sendNow(Context context, String text, String source, String externalId, String occurredAt) {
        SettingsStore store = new SettingsStore(context);
        HttpURLConnection connection = null;
        try {
            if (!store.configured()) return new Result(false, false, false, "请先保存服务器地址和密钥");
            // Validate again at send time so a configuration saved by an older
            // APK cannot send a token to a public HTTP endpoint after upgrade.
            EndpointNormalizer.validateBaseUrl(store.endpoint());
            JSONObject body = new JSONObject()
                    .put("ledgerId", store.ledgerId())
                    .put("text", text)
                    .put("source", source)
                    .put("externalId", externalId)
                    .put("time", ApiTime.normalize(occurredAt));
            connection = (HttpURLConnection) new URL(store.endpoint()).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(20_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Authorization", "Bearer " + store.token());
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Idempotency-Key", externalId);
            connection.setRequestProperty("X-Client-Platform", "android");
            connection.setRequestProperty("X-Client-Version", BuildConfig.VERSION_NAME);
            connection.setRequestProperty("X-Device-ID", store.deviceId());
            connection.setRequestProperty("X-Ledger-ID", String.valueOf(store.ledgerId()));
            connection.setRequestProperty("User-Agent", "NeoLedger-Android/" + BuildConfig.VERSION_NAME);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            String response = read(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            if (status >= 200 && status < 300) {
                boolean duplicate = false;
                try { duplicate = new JSONObject(response).optBoolean("duplicate", false); }
                catch (Exception ignored) {}
                return new Result(true, false, duplicate, duplicate
                        ? "已确认：重复事件未再次入账"
                        : "已入账：" + source);
            }
            boolean retryable = status == 408 || status == 429 || status >= 500;
            String detail = response.length() > 180 ? response.substring(0, 180) : response;
            return new Result(false, retryable, false, "服务器返回 " + status + (detail.isEmpty() ? "" : "：" + detail));
        } catch (Exception error) {
            String detail = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
            return new Result(false, true, false, "连接失败：" + detail);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String read(InputStream input) throws Exception {
        if (input == null) return "";
        StringBuilder value = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null && value.length() < 1000) value.append(line);
        }
        return value.toString();
    }

    private HttpSender() {}
}
