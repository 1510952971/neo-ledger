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
        String fingerprint = notification.getKey() + "|" + PaymentNotificationParser.amountFingerprint(text);
        if (!store.claimNotification(fingerprint)) return;
        String externalId = "android:" + digest(notification.getPackageName() + "|" + notification.getKey() + "|" + text);
        String payload = "【" + source + "】" + text;
        PendingEventStore queue = new PendingEventStore(this);
        queue.enqueue(externalId, payload, "android-notification", notification.getPostTime());
        store.captured(source + "：" + text, queue.count());
        sendBroadcast(new android.content.Intent(SettingsStore.ACTION_STATUS).setPackage(getPackageName()));
        SyncScheduler.schedule(this, true);
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
