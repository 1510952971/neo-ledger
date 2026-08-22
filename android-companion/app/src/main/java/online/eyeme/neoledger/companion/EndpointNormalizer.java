package online.eyeme.neoledger.companion;

final class EndpointNormalizer {
    private static final String TRANSACTIONS_PATH = "/api/v1/transactions";
    private static final String LEGACY_PATH = "/api/external/quick-sync";

    private EndpointNormalizer() {}

    static String transactionEndpoint(String value) {
        return baseUrl(value) + TRANSACTIONS_PATH;
    }

    static String baseUrl(String value) {
        String normalized = value == null ? "" : value.trim().replaceAll("/+$", "");
        if (normalized.endsWith(TRANSACTIONS_PATH)) {
            return normalized.substring(0, normalized.length() - TRANSACTIONS_PATH.length());
        }
        if (normalized.endsWith(LEGACY_PATH)) {
            return normalized.substring(0, normalized.length() - LEGACY_PATH.length());
        }
        return normalized;
    }
}
