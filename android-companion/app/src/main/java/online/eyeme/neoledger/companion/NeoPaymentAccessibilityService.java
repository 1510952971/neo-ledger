package online.eyeme.neoledger.companion;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Observes only the visible foreground UI of configured payment apps.
 * This service never clicks, types, approves, or initiates a payment.
 */
public final class NeoPaymentAccessibilityService extends AccessibilityService {
    private static final int MAX_NODES = 240;
    private static final int MAX_TEXT_LENGTH = 8_000;
    private static final long ACTIVE_WINDOW_POLL_MS = 900L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable activeWindowPoll = new Runnable() {
        @Override public void run() {
            scanActiveWindow();
            handler.postDelayed(this, ACTIVE_WINDOW_POLL_MS);
        }
    };

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        handler.removeCallbacks(activeWindowPoll);
        handler.post(activeWindowPoll);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        int type = event.getEventType();
        if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                && type != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) return;

        String packageName = event.getPackageName().toString();
        SettingsStore store = new SettingsStore(this);
        if (!store.configured() || !PaymentNotificationParser.acceptsPackage(packageName, store)) return;

        String source = PaymentAppCatalog.source(packageName);
        store.recordAccessibilityEvent(source, type);
        scan(packageName, getRootInActiveWindow(), event.getText(), store, source);
    }

    private void scanActiveWindow() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null) return;
        String packageName = root.getPackageName().toString();
        SettingsStore store = new SettingsStore(this);
        if (!store.configured() || !PaymentNotificationParser.acceptsPackage(packageName, store)) return;
        scan(packageName, root, null, store, PaymentAppCatalog.source(packageName));
    }

    private void scan(String packageName, AccessibilityNodeInfo root,
                      java.util.List<CharSequence> eventText, SettingsStore store, String source) {
        String text = visibleText(root);
        if (text.isEmpty() && eventText != null) {
            for (CharSequence value : eventText) {
                if (value != null) text += " " + value;
            }
        }

        boolean completed = PaymentScreenParser.isPaymentCompleted(packageName, text);
        store.recordAccessibilityScan(source, completed);
        if (!completed) {
            sendBroadcast(new Intent(SettingsStore.ACTION_STATUS).setPackage(getPackageName()));
            return;
        }

        String fingerprint = PaymentScreenParser.identity(packageName, text);
        String externalId = "android-screen:" + digest(fingerprint);
        PendingEventStore queue = new PendingEventStore(this);
        String amount = PaymentNotificationParser.amountFingerprint(text);
        long occurredAt = System.currentTimeMillis();
        PendingEventStore.EnqueueResult queued = queue.enqueueIfNew(
                fingerprint,
                externalId,
                PaymentScreenParser.payload(packageName, text),
                "android-payment-screen",
                packageName,
                amount,
                "screen",
                occurredAt,
                occurredAt);

        store.recordCandidate(source, queued == PendingEventStore.EnqueueResult.QUEUED, queue.count());
        sendBroadcast(new Intent(SettingsStore.ACTION_STATUS).setPackage(getPackageName()));
        if (queued == PendingEventStore.EnqueueResult.QUEUED) SyncScheduler.schedule(this, true);
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        handler.removeCallbacks(activeWindowPoll);
        super.onDestroy();
    }

    private String visibleText(AccessibilityNodeInfo root) {
        if (root == null) return "";
        StringBuilder result = new StringBuilder();
        collect(root, result, new int[]{0});
        return result.toString();
    }

    private void collect(AccessibilityNodeInfo node, StringBuilder result, int[] count) {
        if (node == null || count[0]++ >= MAX_NODES || result.length() >= MAX_TEXT_LENGTH) return;
        if (!node.isVisibleToUser()) return;
        append(result, node.getText());
        append(result, node.getContentDescription());
        for (int index = 0; index < node.getChildCount(); index++)
            collect(node.getChild(index), result, count);
    }

    private void append(StringBuilder result, CharSequence value) {
        if (value == null) return;
        String text = value.toString().replaceAll("\\s+", " ").trim();
        if (!text.isEmpty()) result.append(' ').append(text);
    }

    private String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte item : bytes) result.append(String.format("%02x", item));
            return result.toString();
        } catch (Exception ignored) {
            return Integer.toHexString(value.hashCode());
        }
    }
}
