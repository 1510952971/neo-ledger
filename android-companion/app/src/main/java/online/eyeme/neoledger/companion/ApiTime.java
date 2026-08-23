package online.eyeme.neoledger.companion;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/** Formats integration timestamps with an explicit numeric ISO 8601 offset. */
final class ApiTime {
    private static final ZoneId APP_ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter
            .ofPattern("yyyy-MM-dd'T'HH:mm:ssxxx")
            .withZone(APP_ZONE);

    static String now() {
        return FORMATTER.format(Instant.now());
    }

    static String fromEpochMillis(long epochMillis) {
        return FORMATTER.format(Instant.ofEpochMilli(epochMillis));
    }

    static String normalize(String value) {
        if (value == null || value.trim().isEmpty()) return now();
        String trimmed = value.trim();
        try {
            return FORMATTER.format(Instant.parse(trimmed));
        } catch (Exception ignored) {
            return trimmed;
        }
    }

    private ApiTime() {}
}
