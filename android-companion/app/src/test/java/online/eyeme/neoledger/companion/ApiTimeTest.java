package online.eyeme.neoledger.companion;

import org.junit.Test;

import static org.junit.Assert.assertTrue;

public class ApiTimeTest {
    private static final String ISO_WITH_OFFSET =
            "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}[+-]\\d{2}:\\d{2}$";

    @Test public void generatedTimesContainNumericOffset() {
        assertTrue(ApiTime.now().matches(ISO_WITH_OFFSET));
        assertTrue(ApiTime.fromEpochMillis(0).matches(ISO_WITH_OFFSET));
    }

    @Test public void queuedUtcTimesAreConvertedToNumericOffset() {
        assertTrue(ApiTime.normalize("2026-08-23T12:34:56Z").matches(ISO_WITH_OFFSET));
    }
}
