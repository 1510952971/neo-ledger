package online.eyeme.neoledger.companion;

/**
 * Produces an identity for one payment notification event.
 *
 * NotificationListenerService can deliver several updates for the same
 * notification. The notification key and amount are stable across those
 * updates, while the rendered text often is not.
 */
final class NotificationEventIdentity {
    private NotificationEventIdentity() {}

    static String fingerprint(String packageName, String notificationKey, String text) {
        return packageName + "|notification|amount="
                + PaymentNotificationParser.amountFingerprint(text)
                + "|key=" + notificationKey;
    }
}
