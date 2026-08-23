package online.eyeme.neoledger.companion;

import android.app.Notification;
import android.content.ComponentName;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

public final class NeoNotificationListener extends NotificationListenerService {
    @Override
    public void onListenerConnected() {
        new SettingsStore(this).listenerConnected();
        sendBroadcast(new android.content.Intent(SettingsStore.ACTION_STATUS).setPackage(getPackageName()));
        if (new PendingEventStore(this).count() > 0) SyncScheduler.schedule(this, true);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification notification) {
        SettingsStore store = new SettingsStore(this);
        if (!store.configured() || !PaymentNotificationParser.acceptsPackage(notification.getPackageName(), store)) return;
        Notification value = notification.getNotification();
        if ((value.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        String text = notificationText(value.extras);
        if (!PaymentNotificationParser.isPayment(text)) return;
        String source = PaymentNotificationParser.source(notification.getPackageName());
        String fingerprint = NotificationEventIdentity.fingerprint(
                notification.getPackageName(), notification.getKey(), text);
        // Do not include the changing notification text in the identity:
        // payment apps often update the same notification after posting it.
        String externalId = "android:" + digest(fingerprint);
        String payload = "【" + source + "】" + text;
        PendingEventStore queue = new PendingEventStore(this);
        String amount = PaymentNotificationParser.amountFingerprint(text);
        long now = System.currentTimeMillis();
        long postedAt = notification.getPostTime();
        // Some payment apps reuse an old notification object. Keep its post
        // time only when it is close to the capture time; otherwise record
        // the actual observation time instead of an unrelated old timestamp.
        long occurredAt = Math.abs(now - postedAt) <= 5L * 60 * 1000 ? postedAt : now;
        PendingEventStore.EnqueueResult queued = queue.enqueueIfNew(
                fingerprint,
                externalId,
                payload,
                "android-notification",
                notification.getPackageName(),
                amount,
                "notification",
                occurredAt,
                now);
        store.recordCandidate(source, queued == PendingEventStore.EnqueueResult.QUEUED, queue.count());
        sendBroadcast(new android.content.Intent(SettingsStore.ACTION_STATUS).setPackage(getPackageName()));
        if (queued == PendingEventStore.EnqueueResult.QUEUED) SyncScheduler.schedule(this, true);
    }

    @Override
    public void onListenerDisconnected() {
        requestRebind(new ComponentName(this, NeoNotificationListener.class));
    }

    private String notificationText(Bundle extras) {
        List<String> parts = new ArrayList<>();
        if (extras == null) return "";
        add(parts, extras.getCharSequence(Notification.EXTRA_TITLE));
        add(parts, extras.getCharSequence(Notification.EXTRA_TEXT));
        add(parts, extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        add(parts, extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
        add(parts, extras.getCharSequence(Notification.EXTRA_INFO_TEXT));
        add(parts, extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT));
        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null) for (CharSequence line : lines) add(parts, line);
        return String.join("，", parts);
    }

    private void add(List<String> parts, CharSequence value) {
        if (value == null) return;
        String text = value.toString().replaceAll("\\s+", " ").trim();
        if (!text.isEmpty() && !parts.contains(text)) parts.add(text);
    }

    private String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte item : bytes) result.append(String.format("%02x", item));
            return result.toString();
        } catch (Exception ignored) {
            return Integer.toHexString(value.hashCode());
        }
    }
}
