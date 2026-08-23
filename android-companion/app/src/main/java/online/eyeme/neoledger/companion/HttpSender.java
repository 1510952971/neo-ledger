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
        final String message;

        Result(boolean ok, boolean retryable, String message) {
            this.ok = ok;
            this.retryable = retryable;
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
            if (!store.configured()) return new Result(false, false, "请先保存服务器地址和密钥");
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
            connection.setRequestProperty("User-Agent", "NeoLedger-Android/1.0");
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            String response = read(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            if (status >= 200 && status < 300) {
                boolean duplicate = false;
                try { duplicate = new JSONObject(response).optBoolean("duplicate", false); }
                catch (Exception ignored) {}
                return new Result(true, false, duplicate
                        ? "已确认：重复事件未再次入账"
                        : "已入账：" + source);
            }
            boolean retryable = status == 408 || status == 429 || status >= 500;
            String detail = response.length() > 180 ? response.substring(0, 180) : response;
            return new Result(false, retryable, "服务器返回 " + status + (detail.isEmpty() ? "" : "：" + detail));
        } catch (Exception error) {
            String detail = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
            return new Result(false, true, "连接失败：" + detail);
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
