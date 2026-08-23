package online.eyeme.neoledger.companion;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.text.method.PasswordTransformationMethod;
import android.net.Uri;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

public final class MainActivity extends Activity {
    private SettingsStore store;
    private EditText endpoint;
    private EditText token;
    private EditText ledgerId;
    private EditText extraPackages;
    private Switch wechat;
    private Switch alipay;
    private Switch marketApps;
    private TextView permissionState;
    private TextView accessibilityState;
    private TextView accessibilityDebugState;
    private TextView updateState;
    private TextView sendState;
    private TextView deliveryState;
    private TextView capturedState;
    private TextView queueState;
    private Button retryButton;
    private java.io.File downloadedApk;

    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { refreshStatus(); }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        store = new SettingsStore(this);
        setContentView(buildView());
        load();
    }

    @Override
    protected void onStart() {
        super.onStart();
        IntentFilter filter = new IntentFilter(SettingsStore.ACTION_STATUS);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(statusReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(statusReceiver, filter);
    }

    @Override
    protected void onStop() {
        unregisterReceiver(statusReceiver);
        super.onStop();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
        if (downloadedApk != null && canInstallPackages()) installDownloadedApk();
    }

    private View buildView() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(22), dp(24), dp(22), dp(36));
        root.setBackgroundColor(color("#F8F6F1"));
        scroll.addView(root, new ScrollView.LayoutParams(-1, -2));

        TextView title = text("Neo Ledger 自动记账", 25, "#262824");
        title.setTypeface(null, 1);
        root.addView(title);
        TextView subtitle = text("监听支付通知并发送到你的账本", 14, "#657066");
        subtitle.setPadding(0, dp(4), 0, dp(20));
        root.addView(subtitle);

        section(root, "应用更新");
        updateState = text("当前版本：v" + BuildConfig.VERSION_NAME, 13, "#657066");
        updateState.setLineSpacing(0, 1.2f);
        root.addView(updateState, topMargin(4));
        Button update = button("检查新版 APK", false);
        update.setOnClickListener(view -> checkForAppUpdate());
        root.addView(update, topMargin(8));

        TextView quickHint = text("推荐流程：网页生成安卓配置 → 一键粘贴 → 开启通知权限 → 发送测试账单", 13, "#657066");
        quickHint.setLineSpacing(0, 1.2f);
        root.addView(quickHint, matchWrap());
        Button quickStart = button("一键粘贴配置并开启通知权限", true);
        quickStart.setOnClickListener(view -> {
            if (pasteConfiguration())
                startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
        });
        root.addView(quickStart, topMargin(10));

        permissionState = text("", 14, "#657066");
        permissionState.setPadding(dp(14), dp(12), dp(14), dp(12));
        root.addView(permissionState, matchWrap());

        Button permission = button("开启通知读取权限", false);
        permission.setOnClickListener(view -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        root.addView(permission, topMargin(10));

        section(root, "付款完成界面识别");
        TextView accessibilityHint = text(
                "仅读取当前前台支付 App 的可见界面；必须出现支付成功结果和明确金额才会记账。不会点击支付、不会替你付款。",
                13, "#657066");
        accessibilityHint.setLineSpacing(0, 1.2f);
        root.addView(accessibilityHint, topMargin(4));
        accessibilityState = text("无障碍支付识别：未开启", 14, "#B44040");
        accessibilityState.setPadding(dp(14), dp(12), dp(14), dp(12));
        root.addView(accessibilityState, topMargin(8));
        accessibilityDebugState = text("无障碍事件：尚未收到已配置支付 App 的界面事件", 13, "#657066");
        accessibilityDebugState.setLineSpacing(0, 1.2f);
        root.addView(accessibilityDebugState, topMargin(6));
        Button accessibility = button("开启无障碍支付识别", false);
        accessibility.setOnClickListener(view -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        root.addView(accessibility, topMargin(8));

        Button background = button("厂商自启动 / 后台设置", false);
        background.setOnClickListener(view -> openAutostartSettings());
        root.addView(background, topMargin(10));

        Button battery = button("系统省电设置", false);
        battery.setOnClickListener(view -> openBatterySettings());
        root.addView(battery, topMargin(10));

        section(root, "连接设置");
        Button paste = button("从 Neo Ledger 粘贴配置", false);
        paste.setOnClickListener(view -> pasteConfiguration());
        root.addView(paste, topMargin(8));
        endpoint = field("Neo Ledger 地址，例如 http://电脑局域网地址:3000", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        root.addView(endpoint, topMargin(10));
        token = field("自动记账密钥", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        token.setTransformationMethod(PasswordTransformationMethod.getInstance());
        root.addView(token, topMargin(10));
        ledgerId = field("账本 ID，默认 1", InputType.TYPE_CLASS_NUMBER);
        root.addView(ledgerId, topMargin(10));

        section(root, "监听来源");
        wechat = toggle("微信支付通知");
        alipay = toggle("支付宝通知");
        marketApps = toggle("抖音 / 小红书 / 闲鱼 / 淘宝 / 京东 / 美团等支付");
        root.addView(wechat, topMargin(4));
        root.addView(alipay, topMargin(2));
        root.addView(marketApps, topMargin(2));
        extraPackages = field("其他应用包名，用逗号分隔（可选）", InputType.TYPE_CLASS_TEXT);
        root.addView(extraPackages, topMargin(10));

        Button save = button("保存配置", true);
        save.setOnClickListener(view -> saveConfig(true));
        root.addView(save, topMargin(18));

        Button test = button("发送 ¥0.01 测试账单", false);
        test.setOnClickListener(view -> {
            if (!saveConfig(false)) return;
            SettingsStore.TestEvent testEvent = store.testEvent();
            sendState.setText("正在发送测试账单…");
            HttpSender.sendNowAsync(this,
                    "支付宝支付，自动记账连接测试消费0.01元",
                    "android-companion-test",
                    testEvent.id,
                    testEvent.occurredAt,
                    (ok, message) -> {
                        sendState.setText(message);
                        sendState.setTextColor(color(ok ? "#247A55" : "#B44040"));
                    });
        });
        root.addView(test, topMargin(10));

        retryButton = button("立即发送待处理账单", false);
        retryButton.setOnClickListener(view -> {
            if (!saveConfig(false)) return;
            sendState.setText("正在尝试发送…");
            SyncScheduler.schedule(this, true);
            Toast.makeText(this, "已开始发送", Toast.LENGTH_SHORT).show();
        });
        root.addView(retryButton, topMargin(10));

        sendState = text("尚未发送通知", 14, "#657066");
        sendState.setPadding(0, dp(16), 0, 0);
        root.addView(sendState);

        queueState = text("待发送：0 条", 14, "#657066");
        queueState.setPadding(0, dp(8), 0, 0);
        root.addView(queueState);

        deliveryState = text("累计：识别 0 · 入队 0 · 已入账 0 · 已去重 0 · 失败 0", 13, "#657066");
        deliveryState.setPadding(0, dp(8), 0, 0);
        deliveryState.setLineSpacing(0, 1.2f);
        root.addView(deliveryState);

        capturedState = text("最近捕获：尚未捕获支付通知", 13, "#657066");
        capturedState.setPadding(0, dp(8), 0, 0);
        capturedState.setLineSpacing(0, 1.2f);
        root.addView(capturedState);

        TextView note = text(
                "保持 Neo Ledger 服务正在运行。局域网地址仅适合同一 Wi-Fi；外网必须使用 HTTPS 或可信 VPN。通知模式只处理金额和支付关键词；无障碍模式只处理当前支付 App 的支付完成界面，密钥仅加密保存在本机。",
                13,
                "#657066");
        note.setLineSpacing(0, 1.25f);
        note.setPadding(0, dp(22), 0, 0);
        root.addView(note);
        return scroll;
    }

    private void load() {
        endpoint.setText(EndpointNormalizer.baseUrl(store.endpoint()));
        token.setText(store.token());
        ledgerId.setText(String.valueOf(store.ledgerId()));
        wechat.setChecked(store.wechatEnabled());
        alipay.setChecked(store.alipayEnabled());
        marketApps.setChecked(store.marketAppsEnabled());
        extraPackages.setText(store.extraPackages());
        refreshStatus();
    }

    private boolean saveConfig(boolean toast) {
        String url = endpoint.getText().toString().trim();
        String secret = token.getText().toString().trim();
        if (!(url.startsWith("http://") || url.startsWith("https://")) || secret.length() < 20) {
            Toast.makeText(this, "请填写有效地址和完整自动记账密钥", Toast.LENGTH_LONG).show();
            return false;
        }
        try {
            int ledger = Integer.parseInt(ledgerId.getText().toString().trim());
            store.save(url, secret, ledger, wechat.isChecked(), alipay.isChecked(),
                    marketApps.isChecked(), extraPackages.getText().toString());
            if (toast) Toast.makeText(this, "配置已保存", Toast.LENGTH_SHORT).show();
            refreshStatus();
            return true;
        } catch (Exception error) {
            Toast.makeText(this, "保存失败：" + error.getMessage(), Toast.LENGTH_LONG).show();
            return false;
        }
    }

    private void refreshStatus() {
        boolean granted = notificationAccessGranted();
        permissionState.setText(granted ? "通知读取权限：已开启" : "通知读取权限：未开启");
        permissionState.setTextColor(color(granted ? "#247A55" : "#B44040"));
        permissionState.setBackgroundColor(color(granted ? "#E5F5EC" : "#FBE9E7"));
        if (accessibilityState != null) {
            boolean enabled = accessibilityRecognitionGranted();
            accessibilityState.setText(enabled ? "无障碍支付识别：已开启" : "无障碍支付识别：未开启");
            accessibilityState.setTextColor(color(enabled ? "#247A55" : "#B44040"));
            accessibilityState.setBackgroundColor(color(enabled ? "#E5F5EC" : "#FBE9E7"));
        }
        if (accessibilityDebugState != null) accessibilityDebugState.setText(store.accessibilitySummary());
        if (sendState != null) sendState.setText("发送状态：" + store.lastStatus());
        int pending = new PendingEventStore(this).count();
        if (queueState != null) queueState.setText("待发送：" + pending + " 条");
        if (deliveryState != null) deliveryState.setText(store.deliverySummary());
        updateRetryButton(pending);
        if (capturedState != null) capturedState.setText("最近捕获：" + store.lastCaptured());
    }

    private void updateRetryButton(int pending) {
        if (retryButton == null) return;
        if (pending > 0) {
            retryButton.setText("立即发送待处理账单（" + pending + " 条）");
            retryButton.setTextColor(color("#162017"));
            retryButton.setBackgroundTintList(ColorStateList.valueOf(color("#9CFA66")));
        } else {
            retryButton.setText("立即发送待处理账单");
            retryButton.setTextColor(Color.WHITE);
            retryButton.setBackgroundTintList(ColorStateList.valueOf(color("#44584C")));
        }
    }

    private boolean notificationAccessGranted() {
        String enabled = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return enabled != null && enabled.contains(getPackageName());
    }

    private boolean accessibilityRecognitionGranted() {
        String enabled = Settings.Secure.getString(
                getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        ComponentName expected = new ComponentName(this, NeoPaymentAccessibilityService.class);
        for (String value : enabled.split(":")) {
            if (expected.equals(ComponentName.unflattenFromString(value))) return true;
        }
        return false;
    }

    private void checkForAppUpdate() {
        updateState.setText("正在检查 GitHub 最新版本…");
        AppUpdater.check(this, result -> {
            if (!result.ok) {
                updateState.setText(result.message);
                return;
            }
            if (!result.available || result.release == null) {
                updateState.setText("当前版本：v" + BuildConfig.VERSION_NAME + "（已是最新版）");
                Toast.makeText(this, "当前已是最新版", Toast.LENGTH_SHORT).show();
                return;
            }
            updateState.setText("发现新版：v" + result.version);
            String notes = result.release.notes == null ? "" : result.release.notes.trim();
            if (notes.length() > 800) notes = notes.substring(0, 800) + "…";
            new android.app.AlertDialog.Builder(this)
                    .setTitle("发现 Neo Ledger 新版")
                    .setMessage("v" + result.version + (notes.isEmpty() ? "" : "\n\n" + notes))
                    .setNegativeButton("稍后", null)
                    .setPositiveButton("下载并安装", (dialog, which) -> downloadAppUpdate(result.release))
                    .show();
        });
    }

    private void downloadAppUpdate(AppUpdater.Release release) {
        updateState.setText("正在下载 v" + release.version + "…");
        AppUpdater.download(this, release, result -> {
            if (!result.ok || result.apk == null) {
                updateState.setText(result.message);
                return;
            }
            downloadedApk = result.apk;
            updateState.setText("v" + release.version + " 已下载，准备安装");
            installDownloadedApk();
        });
    }

    private void installDownloadedApk() {
        if (downloadedApk == null) return;
        java.io.File apk = downloadedApk;
        try {
            downloadedApk = null;
            AppUpdater.install(this, apk);
        } catch (SecurityException error) {
            downloadedApk = apk;
            updateState.setText(error.getMessage());
            Toast.makeText(this, error.getMessage(), Toast.LENGTH_LONG).show();
        } catch (Exception error) {
            downloadedApk = apk;
            updateState.setText("安装更新失败：" + error.getMessage());
            Toast.makeText(this, "安装更新失败：" + error.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private boolean canInstallPackages() {
        return Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls();
    }

    private void openBatterySettings() {
        try {
            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        } catch (Exception ignored) {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getPackageName())));
        }
    }

    private void openAutostartSettings() {
        String brand = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase();
        String[][] candidates;
        if (brand.contains("xiaomi") || brand.contains("redmi")) candidates = new String[][]{
                {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"}};
        else if (brand.contains("huawei") || brand.contains("honor")) candidates = new String[][]{
                {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
                {"com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity"}};
        else if (brand.contains("oppo") || brand.contains("oneplus") || brand.contains("realme")) candidates = new String[][]{
                {"com.oplus.safecenter", "com.oplus.safecenter.startupapp.StartupAppListActivity"},
                {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"}};
        else if (brand.contains("vivo") || brand.contains("iqoo")) candidates = new String[][]{
                {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"}};
        else if (brand.contains("meizu")) candidates = new String[][]{
                {"com.meizu.safe", "com.meizu.safe.permission.SmartBGActivity"}};
        else candidates = new String[0][0];
        for (String[] candidate : candidates) {
            Intent intent = new Intent().setComponent(new ComponentName(candidate[0], candidate[1]));
            if (intent.resolveActivity(getPackageManager()) != null) {
                startActivity(intent);
                return;
            }
        }
        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getPackageName())));
    }

    private boolean pasteConfiguration() {
        try {
            ClipboardManager clipboard = getSystemService(ClipboardManager.class);
            ClipData clip = clipboard == null ? null : clipboard.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) throw new IllegalArgumentException("剪贴板为空");
            JSONObject config = new JSONObject(clip.getItemAt(0).coerceToText(this).toString());
            if (!"neo-ledger-android-config-v1".equals(config.optString("type")))
                throw new IllegalArgumentException("不是 Neo Ledger 安卓配置");
            endpoint.setText(config.getString("url"));
            token.setText(config.getString("token"));
            ledgerId.setText(String.valueOf(config.optInt("ledgerId", 1)));
            if (saveConfig(false)) {
                clipboard.setPrimaryClip(ClipData.newPlainText("", ""));
                Toast.makeText(this, "配置已粘贴并保存，剪贴板中的密钥已清除", Toast.LENGTH_SHORT).show();
                return true;
            }
        } catch (Exception error) {
            Toast.makeText(this, "粘贴失败：" + error.getMessage(), Toast.LENGTH_LONG).show();
        }
        return false;
    }

    private void section(LinearLayout root, String value) {
        TextView title = text(value, 16, "#262824");
        title.setTypeface(null, 1);
        title.setPadding(0, dp(24), 0, dp(2));
        root.addView(title);
    }

    private EditText field(String hint, int inputType) {
        EditText view = new EditText(this);
        view.setHint(hint);
        view.setTextSize(15);
        view.setSingleLine(true);
        view.setInputType(inputType);
        view.setPadding(dp(14), dp(12), dp(14), dp(12));
        view.setTextColor(color("#262824"));
        view.setHintTextColor(color("#8A948B"));
        view.setBackgroundColor(Color.WHITE);
        return view;
    }

    private Switch toggle(String label) {
        Switch view = new Switch(this);
        view.setText(label);
        view.setTextSize(15);
        view.setTextColor(color("#262824"));
        view.setPadding(dp(4), dp(9), dp(4), dp(9));
        return view;
    }

    private Button button(String label, boolean primary) {
        Button view = new Button(this);
        view.setText(label);
        view.setTextSize(15);
        view.setAllCaps(false);
        view.setTextColor(Color.WHITE);
        view.setBackgroundTintList(ColorStateList.valueOf(color(primary ? "#247A55" : "#44584C")));
        view.setMinHeight(dp(52));
        return view;
    }

    private TextView text(String value, int size, String color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color(color));
        return view;
    }

    private LinearLayout.LayoutParams matchWrap() { return new LinearLayout.LayoutParams(-1, -2); }
    private LinearLayout.LayoutParams topMargin(int value) {
        LinearLayout.LayoutParams params = matchWrap();
        params.topMargin = dp(value);
        return params;
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private int color(String value) { return Color.parseColor(value); }
}
