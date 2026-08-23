package online.eyeme.neoledger.companion;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class PaymentAppCatalogTest {
    @Test
    public void recognizesDouyinVariantsAsMarketApps() {
        assertTrue(PaymentAppCatalog.isMarketApp(PaymentAppCatalog.DOUYIN));
        assertTrue(PaymentAppCatalog.isMarketApp(PaymentAppCatalog.DOUYIN_LITE));
        assertEquals("抖音", PaymentAppCatalog.source(PaymentAppCatalog.DOUYIN));
        assertEquals("抖音", PaymentAppCatalog.source(PaymentAppCatalog.DOUYIN_LITE));
    }
}
