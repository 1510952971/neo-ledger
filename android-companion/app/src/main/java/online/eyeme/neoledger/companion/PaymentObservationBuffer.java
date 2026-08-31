package online.eyeme.neoledger.companion;

/**
 * Keeps a very short-lived view of one payment app's visible UI.
 *
 * Payment result sheets are often rendered as a sequence of accessibility
 * events and may disappear before OCR finishes.  Combining only the latest
 * event loses the success marker or the amount; keeping this bounded buffer
 * lets the parser see the complete sheet without turning old order pages into
 * a permanent source of payment candidates.
 */
final class PaymentObservationBuffer {
    static final long TTL_MILLIS = 3_500L;
    private static final int MAX_LENGTH = 8_000;
    private final StringBuilder value = new StringBuilder();
    private long firstObservedAt;
    private long lastUpdatedAt;

    boolean append(String text, long nowMillis) {
        if (text == null || text.trim().isEmpty()) return false;
        expireIfNeeded(nowMillis);
        String normalized = text.replaceAll("\\s+", " ").trim();
        if (normalized.isEmpty() || value.indexOf(normalized) >= 0) {
            lastUpdatedAt = nowMillis;
            return false;
        }
        if (value.length() == 0) firstObservedAt = nowMillis;
        int remaining = MAX_LENGTH - value.length();
        if (remaining <= 0) return false;
        int separator = value.length() > 0 ? 1 : 0;
        if (remaining <= separator) return false;
        if (separator == 1) value.append(' ');
        value.append(normalized, 0, Math.min(normalized.length(), remaining - separator));
        lastUpdatedAt = nowMillis;
        return true;
    }

    String text(long nowMillis) {
        expireIfNeeded(nowMillis);
        return value.toString();
    }

    boolean active(long nowMillis) {
        expireIfNeeded(nowMillis);
        return value.length() > 0;
    }

    void clear() {
        value.setLength(0);
        firstObservedAt = 0L;
        lastUpdatedAt = 0L;
    }

    private void expireIfNeeded(long nowMillis) {
        if (value.length() > 0
                && (nowMillis - firstObservedAt > TTL_MILLIS
                || nowMillis < lastUpdatedAt)) clear();
    }
}
