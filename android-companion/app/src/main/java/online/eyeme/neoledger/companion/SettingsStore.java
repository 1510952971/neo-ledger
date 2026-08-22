package online.eyeme.neoledger.companion;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SettingsStore {
    static final String ACTION_STATUS = "online.eyeme.neoledger.companion.STATUS";
    private static final String PREFS = "neo_companion";
    private static final String KEY_ALIAS = "neo_ledger_companion_token";
    private static final String TOKEN = "token_encrypted";

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
                .putString("last_status", "已捕获，等待发送（" + pending + "）")
                .apply();
    }

    void listenerConnected() {
        preferences.edit().putLong("listener_connected_at", System.currentTimeMillis()).apply();
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
