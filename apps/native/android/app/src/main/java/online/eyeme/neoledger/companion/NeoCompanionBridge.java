package online.eyeme.neoledger.companion;

import android.content.ComponentName;
import android.content.Context;
import android.provider.Settings;

import java.util.HashMap;
import java.util.Map;

/**
 * Small public bridge around the package-private companion service stores.
 * Flutter uses it to configure and display Android capture status inside the
 * same APK that owns the full ledger UI.
 */
public final class NeoCompanionBridge {
    private NeoCompanionBridge() {}

    public static void configure(Context context, String endpoint, String secret, int ledgerId,
                                 boolean wechat, boolean alipay, boolean marketApps,
                                 String extraPackages) throws Exception {
        SettingsStore store = new SettingsStore(context.getApplicationContext());
        store.save(endpoint, secret, ledgerId, wechat, alipay, marketApps,
                extraPackages == null ? "" : extraPackages);
    }

    public static Map<String, Object> status(Context context) {
        Context app = context.getApplicationContext();
        SettingsStore store = new SettingsStore(app);
        Map<String, Object> result = new HashMap<>();
        result.put("configured", store.configured());
        result.put("endpoint", store.endpoint());
        result.put("ledgerId", store.ledgerId());
        result.put("wechat", store.wechatEnabled());
        result.put("alipay", store.alipayEnabled());
        result.put("marketApps", store.marketAppsEnabled());
        result.put("extraPackages", store.extraPackages());
        result.put("pending", new PendingEventStore(app).count());
        result.put("notificationEnabled", notificationEnabled(app));
        result.put("accessibilityEnabled", accessibilityEnabled(app));
        result.put("listenerConnectedAt", store.listenerConnectedAt());
        result.put("lastStatus", store.lastStatus());
        result.put("lastCaptured", store.lastCaptured());
        result.put("accessibilitySummary", store.accessibilitySummary());
        result.put("deliverySummary", store.deliverySummary());
        return result;
    }

    public interface UpdateCallback {
        void complete(Map<String, Object> result);
    }

    public static void installUpdate(Context context, String version, String apkUrl,
                                     String checksumManifestUrl, String apkName,
                                     UpdateCallback callback) {
        NativeAppUpdater.downloadAndInstall(
                context,
                version,
                apkUrl,
                checksumManifestUrl,
                apkName,
                result -> callback.complete(result.asMap()));
    }

    private static boolean notificationEnabled(Context context) {
        String enabled = Settings.Secure.getString(
                context.getContentResolver(), "enabled_notification_listeners");
        return enabled != null && enabled.contains(context.getPackageName());
    }

    private static boolean accessibilityEnabled(Context context) {
        String enabled = Settings.Secure.getString(
                context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        ComponentName component = new ComponentName(context, NeoPaymentAccessibilityService.class);
        return enabled.contains(component.flattenToString())
                || enabled.contains(component.flattenToShortString());
    }
}
