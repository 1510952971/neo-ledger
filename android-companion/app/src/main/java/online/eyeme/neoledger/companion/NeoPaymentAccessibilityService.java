package online.eyeme.neoledger.companion;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.graphics.Bitmap;
import android.hardware.HardwareBuffer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.concurrent.Executor;

/**
 * Observes only the visible foreground UI of configured payment apps.
 * This service never clicks, types, approves, or initiates a payment.
 */
public final class NeoPaymentAccessibilityService extends AccessibilityService {
    private static final int MAX_NODES = 240;
    private static final int MAX_TEXT_LENGTH = 8_000;
    private static final long ACTIVE_WINDOW_POLL_MS = 400L;
    // Payment result sheets in Douyin and some marketplace apps can disappear
    // in roughly one second. A single screenshot is therefore not reliable.
    private static final long SCREENSHOT_MIN_INTERVAL_MS = 260L;
    private static final long[] OCR_RETRY_DELAYS_MS = {280L, 760L, 1_280L};
    private static final long COMPLETION_COOLDOWN_MS = 5_000L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Executor screenshotExecutor = command -> handler.post(command);
    private TextRecognizer textRecognizer;
    private boolean screenshotInFlight;
    private long lastScreenshotAt;
    private String lastCompletedPackage;
    private long lastCompletedAt;
    private String observedPackage;
    private long screenObservation;
    private final PaymentObservationBuffer observationBuffer = new PaymentObservationBuffer();
    private final Runnable activeWindowPoll = new Runnable() {
        @Override public void run() {
            scanActiveWindow();
            handler.postDelayed(this, ACTIVE_WINDOW_POLL_MS);
        }
    };

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        textRecognizer = TextRecognition.getClient(
                new ChineseTextRecognizerOptions.Builder().build());
        handler.removeCallbacks(activeWindowPoll);
        handler.post(activeWindowPoll);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        int type = event.getEventType();
        if (!isRelevantEvent(type)) return;

        String packageName = event.getPackageName().toString();
        SettingsStore store = new SettingsStore(this);
        if (!store.configured() || !PaymentNotificationParser.acceptsPackage(packageName, store)) return;

        String source = PaymentAppCatalog.source(packageName);
        store.recordAccessibilityEvent(source, type);
        scan(packageName, getRootInActiveWindow(), event.getText(), store, source, true, type);
    }

    private void scanActiveWindow() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null) return;
        String packageName = root.getPackageName().toString();
        SettingsStore store = new SettingsStore(this);
        if (!store.configured() || !PaymentNotificationParser.acceptsPackage(packageName, store)) return;
        scan(packageName, root, null, store, PaymentAppCatalog.source(packageName), false, 0);
    }

    private void scan(String packageName, AccessibilityNodeInfo root,
                      java.util.List<CharSequence> eventText, SettingsStore store, String source,
                      boolean eventTriggered, int eventType) {
        long now = System.currentTimeMillis();
        if (packageName.equals(lastCompletedPackage)
                && now - lastCompletedAt < COMPLETION_COOLDOWN_MS) return;

        if (!packageName.equals(observedPackage)) {
            observedPackage = packageName;
            screenObservation++;
            observationBuffer.clear();
        }
        final long observation = screenObservation;

        String earlyEventText = eventText(eventText);
        String visible = visibleText(packageName, root);
        boolean bufferChanged = observationBuffer.append(visible, now);
        bufferChanged |= observationBuffer.append(earlyEventText, now);
        String text = observationBuffer.text(now);

        boolean completed = PaymentScreenParser.isPaymentCompleted(packageName, text);
        if (eventTriggered || bufferChanged) {
            store.recordAccessibilityScan(source, packageName, completed,
                    PaymentScreenParser.rejectionReason(packageName, text), eventType);
        }
        if (!completed) {
            // Capture after collecting accessibility text so OCR gets both the
            // canvas-rendered sheet and any semantic text exposed by the app.
            if (eventTriggered) {
                requestOcr(packageName, source, text, observation);
                scheduleOcrRetries(packageName, source, observation);
            }
            sendBroadcast(new Intent(SettingsStore.ACTION_STATUS).setPackage(getPackageName()));
            return;
        }

        enqueueCompleted(packageName, source, text, store);
    }

    private void enqueueCompleted(String packageName, String source, String text,
                                  SettingsStore store) {

        lastCompletedPackage = packageName;
        lastCompletedAt = System.currentTimeMillis();

        String fingerprint = PaymentScreenParser.identity(packageName, text);
        String externalId = "android-screen:" + digest(fingerprint);
        PendingEventStore queue = new PendingEventStore(this);
        String amount = PaymentScreenParser.amountFingerprint(text);
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
        if (queued == PendingEventStore.EnqueueResult.QUEUED) SyncScheduler.schedule(this, true);
    }

    /**
     * Some payment apps draw the success sheet on a canvas, so it has no
     * AccessibilityNodeInfo text. Capture a short-lived display image and
     * OCR it locally; the parser still requires a success marker, payment
     * semantics, and an amount before anything enters the queue.
     */
    private void scheduleOcrRetries(String packageName, String source, long observation) {
        for (long delay : OCR_RETRY_DELAYS_MS) {
            handler.postDelayed(() -> {
                if (observation != screenObservation || !isCurrentPackage(packageName)) return;
                AccessibilityNodeInfo root = getRootInActiveWindow();
                long now = System.currentTimeMillis();
                observationBuffer.append(visibleText(packageName, root), now);
                String text = observationBuffer.text(now);
                SettingsStore store = new SettingsStore(this);
                if (PaymentScreenParser.isPaymentCompleted(packageName, text)) {
                    enqueueCompleted(packageName, source, text, store);
                    sendBroadcast(new Intent(SettingsStore.ACTION_STATUS).setPackage(getPackageName()));
                    return;
                }
                requestOcr(packageName, source, text, observation);
            }, delay);
        }
    }

    private boolean isCurrentPackage(String packageName) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (samePackage(packageName, root)) return true;
        try {
            List<AccessibilityWindowInfo> windows = getWindows();
            if (windows != null) {
                for (AccessibilityWindowInfo window : windows) {
                    if (window == null) continue;
                    AccessibilityNodeInfo windowRoot = window.getRoot();
                    if (samePackage(packageName, windowRoot)) return true;
                }
            }
        } catch (RuntimeException ignored) {
            // Window enumeration is not reliable on every Android skin.
        }
        // A result sheet can briefly detach the active root while the app is
        // still the observed foreground package. Keep OCR alive only for the
        // bounded observation window, never indefinitely.
        return packageName.equals(observedPackage) && observationBuffer.active(System.currentTimeMillis());
    }

    private void requestOcr(String packageName, String source, String accessibilityText,
                            long observation) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || textRecognizer == null
                || screenshotInFlight || observation != screenObservation
                || !isCurrentPackage(packageName)) return;
        long now = System.currentTimeMillis();
        if (now - lastScreenshotAt < SCREENSHOT_MIN_INTERVAL_MS) return;

        screenshotInFlight = true;
        lastScreenshotAt = now;
        try {
            takeScreenshot(Display.DEFAULT_DISPLAY, screenshotExecutor,
                    new AccessibilityService.TakeScreenshotCallback() {
                        @Override
                        public void onSuccess(AccessibilityService.ScreenshotResult result) {
                            recognizeScreenshot(packageName, source, accessibilityText, observation, result);
                        }

                        @Override
                        public void onFailure(int errorCode) {
                            screenshotInFlight = false;
                            recordOcrDiagnostic(source, packageName,
                                    "截图失败（系统错误码 " + errorCode + "）");
                        }
                    });
        } catch (RuntimeException ignored) {
            screenshotInFlight = false;
            recordOcrDiagnostic(source, packageName, "截图调用失败");
        }
    }

    private void recognizeScreenshot(String packageName, String source,
                                     String accessibilityText,
                                     long observation,
                                     AccessibilityService.ScreenshotResult result) {
        Bitmap bitmap = copyScreenshot(result);
        if (bitmap == null || textRecognizer == null) {
            screenshotInFlight = false;
            recordOcrDiagnostic(source, packageName,
                    bitmap == null ? "截图不可用" : "OCR 未初始化");
            return;
        }

        if (observation != screenObservation || !isCurrentPackage(packageName)) {
            bitmap.recycle();
            screenshotInFlight = false;
            return;
        }

        final Bitmap screenshotBitmap = bitmap;
        final InputImage image = InputImage.fromBitmap(screenshotBitmap, 0);
        textRecognizer.process(image)
                .addOnSuccessListener(screenshotExecutor, recognized -> {
                    String ocrText = recognized == null ? "" : recognized.getText();
                    if (observation != screenObservation || !isCurrentPackage(packageName)) {
                        return;
                    }
                    long now = System.currentTimeMillis();
                    observationBuffer.append(accessibilityText, now);
                    observationBuffer.append(ocrText, now);
                    String combined = observationBuffer.text(now);
                    SettingsStore store = new SettingsStore(this);
                    boolean completed = PaymentScreenParser.isPaymentCompleted(packageName, combined);
                    store.recordAccessibilityScan(source, packageName, completed,
                            PaymentScreenParser.rejectionReason(packageName, combined), 0);
                    if (completed) enqueueCompleted(packageName, source, combined, store);
                    sendBroadcast(new Intent(SettingsStore.ACTION_STATUS).setPackage(getPackageName()));
                })
                .addOnFailureListener(screenshotExecutor, ignored -> {
                    recordOcrDiagnostic(source, packageName, "截图已获取，但 OCR 识别失败");
                })
                .addOnCompleteListener(screenshotExecutor, ignored -> {
                    screenshotInFlight = false;
                    screenshotBitmap.recycle();
                });
    }

    private Bitmap copyScreenshot(AccessibilityService.ScreenshotResult result) {
        if (result == null) return null;
        HardwareBuffer buffer = result.getHardwareBuffer();
        if (buffer == null) return null;
        try {
            Bitmap hardwareBitmap = Bitmap.wrapHardwareBuffer(buffer, result.getColorSpace());
            return hardwareBitmap == null
                    ? null
                    : hardwareBitmap.copy(Bitmap.Config.ARGB_8888, false);
        } catch (RuntimeException ignored) {
            return null;
        } finally {
            buffer.close();
        }
    }

    private void recordOcrDiagnostic(String source, String packageName, String detail) {
        new SettingsStore(this).recordAccessibilityScan(source, packageName, false, detail, 0);
        sendBroadcast(new Intent(SettingsStore.ACTION_STATUS).setPackage(getPackageName()));
    }

    private boolean isRelevantEvent(int type) {
        return type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                || type == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
                || type == AccessibilityEvent.TYPE_WINDOWS_CHANGED
                || type == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED
                || type == AccessibilityEvent.TYPE_VIEW_SCROLLED
                || type == AccessibilityEvent.TYPE_VIEW_SELECTED
                || type == AccessibilityEvent.TYPE_VIEW_FOCUSED
                || type == AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUSED;
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        handler.removeCallbacks(activeWindowPoll);
        if (textRecognizer != null) textRecognizer.close();
        super.onDestroy();
    }

    private String visibleText(String packageName, AccessibilityNodeInfo fallbackRoot) {
        StringBuilder result = new StringBuilder();
        int[] count = new int[]{0};
        try {
            List<AccessibilityWindowInfo> windows = getWindows();
            for (int pass = 0; pass < 2; pass++) {
                for (AccessibilityWindowInfo window : windows) {
                    if (window == null) continue;
                    boolean priority = window.isActive() || window.isFocused();
                    if ((pass == 0) != priority) continue;
                    AccessibilityNodeInfo windowRoot = window.getRoot();
                    if (!samePackage(packageName, windowRoot)) continue;
                    collect(windowRoot, result, count);
                    if (count[0] >= MAX_NODES || result.length() >= MAX_TEXT_LENGTH) break;
                }
                if (count[0] >= MAX_NODES || result.length() >= MAX_TEXT_LENGTH) break;
            }
        } catch (RuntimeException ignored) {
            // Some Android builds expose getWindows only intermittently.
        }
        if (result.length() == 0 && fallbackRoot != null) collect(fallbackRoot, result, count);
        return result.toString();
    }

    private boolean samePackage(String packageName, AccessibilityNodeInfo root) {
        return root != null && root.getPackageName() != null
                && packageName.equals(root.getPackageName().toString());
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

    private String eventText(List<CharSequence> values) {
        StringBuilder result = new StringBuilder();
        if (values != null) {
            for (CharSequence value : values) append(result, value);
        }
        return result.toString().trim();
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
