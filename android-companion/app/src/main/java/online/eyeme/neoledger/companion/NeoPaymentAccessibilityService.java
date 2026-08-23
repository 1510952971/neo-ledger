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
    private static final long ACTIVE_WINDOW_POLL_MS = 900L;
    private static final long SCREENSHOT_MIN_INTERVAL_MS = 1_100L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Executor screenshotExecutor = command -> handler.post(command);
    private TextRecognizer textRecognizer;
    private boolean screenshotInFlight;
    private long lastScreenshotAt;
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
        String text = visibleText(packageName, root);
        if (eventText != null) {
            for (CharSequence value : eventText) {
                if (value != null) text += " " + value;
            }
        }

        boolean completed = PaymentScreenParser.isPaymentCompleted(packageName, text);
        store.recordAccessibilityScan(source, completed,
                PaymentScreenParser.rejectionReason(packageName, text));
        if (!completed) {
            requestOcr(packageName, source, text);
            sendBroadcast(new Intent(SettingsStore.ACTION_STATUS).setPackage(getPackageName()));
            return;
        }

        enqueueCompleted(packageName, source, text, store);
    }

    private void enqueueCompleted(String packageName, String source, String text,
                                  SettingsStore store) {

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
    private void requestOcr(String packageName, String source, String accessibilityText) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || textRecognizer == null
                || screenshotInFlight) return;
        long now = System.currentTimeMillis();
        if (now - lastScreenshotAt < SCREENSHOT_MIN_INTERVAL_MS) return;

        screenshotInFlight = true;
        lastScreenshotAt = now;
        try {
            takeScreenshot(Display.DEFAULT_DISPLAY, screenshotExecutor,
                    new AccessibilityService.TakeScreenshotCallback() {
                        @Override
                        public void onSuccess(AccessibilityService.ScreenshotResult result) {
                            recognizeScreenshot(packageName, source, accessibilityText, result);
                        }

                        @Override
                        public void onFailure(int errorCode) {
                            screenshotInFlight = false;
                            recordOcrDiagnostic(source, "截图失败（系统错误码 " + errorCode + "）");
                        }
                    });
        } catch (RuntimeException ignored) {
            screenshotInFlight = false;
            recordOcrDiagnostic(source, "截图调用失败");
        }
    }

    private void recognizeScreenshot(String packageName, String source,
                                     String accessibilityText,
                                     AccessibilityService.ScreenshotResult result) {
        Bitmap bitmap = copyScreenshot(result);
        if (bitmap == null || textRecognizer == null) {
            screenshotInFlight = false;
            recordOcrDiagnostic(source, bitmap == null ? "截图不可用" : "OCR 未初始化");
            return;
        }

        final Bitmap screenshotBitmap = bitmap;
        final InputImage image = InputImage.fromBitmap(screenshotBitmap, 0);
        textRecognizer.process(image)
                .addOnSuccessListener(screenshotExecutor, recognized -> {
                    String ocrText = recognized == null ? "" : recognized.getText();
                    String combined = (accessibilityText == null ? "" : accessibilityText)
                            + " " + ocrText;
                    SettingsStore store = new SettingsStore(this);
                    boolean completed = PaymentScreenParser.isPaymentCompleted(packageName, combined);
                    store.recordAccessibilityScan(source, completed,
                            PaymentScreenParser.rejectionReason(packageName, combined));
                    if (completed) enqueueCompleted(packageName, source, combined, store);
                    sendBroadcast(new Intent(SettingsStore.ACTION_STATUS).setPackage(getPackageName()));
                })
                .addOnFailureListener(screenshotExecutor, ignored -> {
                    recordOcrDiagnostic(source, "截图已获取，但 OCR 识别失败");
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

    private void recordOcrDiagnostic(String source, String detail) {
        new SettingsStore(this).recordAccessibilityScan(source, false, detail);
        sendBroadcast(new Intent(SettingsStore.ACTION_STATUS).setPackage(getPackageName()));
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
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
