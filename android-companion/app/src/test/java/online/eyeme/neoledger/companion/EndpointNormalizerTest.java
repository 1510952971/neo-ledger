package online.eyeme.neoledger.companion;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class EndpointNormalizerTest {
    @Test
    public void appendsVersionedEndpointToBaseUrl() {
        assertEquals(
                "https://ledger.example.com/api/v1/transactions",
                EndpointNormalizer.transactionEndpoint("https://ledger.example.com"));
    }

    @Test
    public void migratesLegacyEndpointWithoutDuplicatingPath() {
        assertEquals(
                "https://ledger.example.com/api/v1/transactions",
                EndpointNormalizer.transactionEndpoint(
                        "https://ledger.example.com/api/external/quick-sync"));
    }

    @Test
    public void keepsExistingVersionedEndpointUnchanged() {
        assertEquals(
                "https://ledger.example.com/api/v1/transactions",
                EndpointNormalizer.transactionEndpoint(
                        "https://ledger.example.com/api/v1/transactions"));
    }

    @Test
    public void trimsWhitespaceAndTrailingSlashes() {
        assertEquals(
                "https://ledger.example.com/api/v1/transactions",
                EndpointNormalizer.transactionEndpoint("  https://ledger.example.com///  "));
        assertEquals(
                "https://ledger.example.com",
                EndpointNormalizer.baseUrl(
                        "https://ledger.example.com/api/v1/transactions///"));
    }

    @Test
    public void doesNotStripSimilarUnrelatedPaths() {
        assertEquals(
                "https://ledger.example.com/api/v1/transactions-preview/api/v1/transactions",
                EndpointNormalizer.transactionEndpoint(
                        "https://ledger.example.com/api/v1/transactions-preview"));
    }
}
