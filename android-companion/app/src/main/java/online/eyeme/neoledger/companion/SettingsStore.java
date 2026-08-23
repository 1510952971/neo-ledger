package online.eyeme.neoledger.companion;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SettingsStore {
    static final String ACTION_STATUS = "online.eyeme.neoledger.companion.STATUS";
    private static final String PREFS = "neo_companion";
    private static final String KEY_ALIAS = "neo_ledger_companion_token";
    private static final String TOKEN = "token_encrypted";

    static final class TestEvent {
        final String id;
        final String occurredAt;

        TestEvent(String id, String occurredAt) {
            this.id = id;
            this.occurredAt = occurredAt;
        }
    }

    private final SharedPreferences preferences;

    SettingsStore(Context context) {
        preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    void save(String endpoint, String token, int ledgerId, boolean wechat, boolean alipay,
              boolean marketApps, String extraPackages) throws Exception {
        preferences.edit()
                .putString("endpoint", EndpointNormalizer.transactionEndpoint(endpoint))
                .putString(TOKEN, encrypt(token.trim()))
                .putInt("ledger_id", Math.max(1, ledgerId))
                .putBoolean("wechat", wechat)
                .putBoolean("alipay", alipay)
                .putBoolean("market_apps", marketApps)
                .putString("extra_packages", extraPackages.trim())
                .apply();
    }

    String endpoint() { return preferences.getString("endpoint", ""); }
    int ledgerId() { return preferences.getInt("ledger_id", 1); }
    boolean wechatEnabled() { return preferences.getBoolean("wechat", true); }
    boolean alipayEnabled() { return preferences.getBoolean("alipay", true); }
    boolean marketAppsEnabled() { return preferences.getBoolean("market_apps", true); }
    String extraPackages() { return preferences.getString("extra_packages", ""); }
    boolean configured() { return !endpoint().isEmpty() && !token().isEmpty(); }
    String lastStatus() { return preferences.getString("last_status", "尚未发送通知"); }
    String lastCaptured() { return preferences.getString("last_captured", "尚未捕获支付通知"); }
    long listenerConnectedAt() { return preferences.getLong("listener_connected_at", 0); }

    String token() {
        try {
            String value = preferences.getString(TOKEN, "");
            return value.isEmpty() ? "" : decrypt(value);
        } catch (Exception ignored) {
            return "";
        }
    }

    void status(String value) {
        preferences.edit().putString("last_status", value).apply();
    }

    void captured(String value, int pending) {
        String safe = value.length() > 160 ? value.substring(0, 160) + "…" : value;
        preferences.edit()
                .putString("last_captured", safe)
                .apply();
    }

    void recordCandidate(String source, boolean queued, int pending) {
        String safe = source == null || source.isEmpty() ? "支付应用" : source;
        int candidates = preferences.getInt("candidate_count", 0) + 1;
        SharedPreferences.Editor editor = preferences.edit()
                .putInt("candidate_count", candidates)
                .putString("last_captured", queued
                        ? safe + "：已识别支付事件，已加入发送队列"
                        : safe + "：重复支付候选已拦截，未重复入队");
        if (queued) editor.putInt("queued_count", preferences.getInt("queued_count", 0) + 1);
        else editor.putInt("deduped_count", preferences.getInt("deduped_count", 0) + 1);
        editor.putString("last_status", queued
                        ? "已识别，待发送 " + pending + " 条"
                        : "已去重，待发送 " + pending + " 条")
                .apply();
    }

    void recordDelivery(HttpSender.Result result) {
        SharedPreferences.Editor editor = preferences.edit().putString("last_status", result.message);
        if (result.ok && result.duplicate)
            editor.putInt("deduped_count", preferences.getInt("deduped_count", 0) + 1);
        else if (result.ok)
            editor.putInt("delivered_count", preferences.getInt("delivered_count", 0) + 1);
        else
            editor.putInt("failed_count", preferences.getInt("failed_count", 0) + 1);
        editor.apply();
    }

    String deliverySummary() {
        return "累计：识别 " + preferences.getInt("candidate_count", 0)
                + " · 入队 " + preferences.getInt("queued_count", 0)
                + " · 已入账 " + preferences.getInt("delivered_count", 0)
                + " · 已去重 " + preferences.getInt("deduped_count", 0)
                + " · 失败 " + preferences.getInt("failed_count", 0);
    }

    void listenerConnected() {
        preferences.edit().putLong("listener_connected_at", System.currentTimeMillis()).apply();
    }

    /**
     * Reuses one test event for the current endpoint and ledger. Repeating the
     * test therefore exercises idempotent retries instead of adding another
     * ¥0.01 entry or causing an idempotency conflict because its time changed.
     */
    TestEvent testEvent() {
        String scope = endpoint() + "|" + ledgerId();
        String savedScope = preferences.getString("test_event_scope", "");
        String id = preferences.getString("test_event_id", "");
        String occurredAt = preferences.getString("test_event_time", "");
        if (scope.equals(savedScope) && !id.isEmpty() && !occurredAt.isEmpty())
            return new TestEvent(id, occurredAt);

        TestEvent event = new TestEvent(
                "android-companion-test:" + UUID.randomUUID(),
                ApiTime.now());
        preferences.edit()
                .putString("test_event_scope", scope)
                .putString("test_event_id", event.id)
                .putString("test_event_time", event.occurredAt)
                .apply();
        return event;
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS))
            return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." +
                Base64.encodeToString(encrypted, Base64.NO_WRAP);
    }

    private String decrypt(String value) throws Exception {
        String[] parts = value.split("\\.", 2);
        if (parts.length != 2) return "";
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
}
