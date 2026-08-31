package online.eyeme.neoledger.companion;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class PaymentObservationBufferTest {
    @Test
    public void mergesShortLivedAccessibilityFragments() {
        PaymentObservationBuffer buffer = new PaymentObservationBuffer();

        assertTrue(buffer.append("支付成功", 1_000L));
        assertTrue(buffer.append("金额 ¥19.88", 1_400L));
        assertTrue(buffer.append("支付方式 抖音月付", 1_800L));

        assertEquals("支付成功 金额 ¥19.88 支付方式 抖音月付", buffer.text(2_000L));
    }

    @Test
    public void ignoresRepeatedFullSnapshotsWithoutResettingOriginalExpiry() {
        PaymentObservationBuffer buffer = new PaymentObservationBuffer();

        assertTrue(buffer.append("订单确认 金额 ¥19.88", 1_000L));
        assertFalse(buffer.append("订单确认 金额 ¥19.88", 2_000L));
        assertEquals("订单确认 金额 ¥19.88", buffer.text(4_400L));
        assertEquals("", buffer.text(4_501L));
    }

    @Test
    public void expiresBeforeASecondPaymentCanReuseOldText() {
        PaymentObservationBuffer buffer = new PaymentObservationBuffer();

        buffer.append("支付成功 ¥7.90", 1_000L);
        assertTrue(buffer.active(2_000L));
        assertFalse(buffer.active(4_501L));
        assertTrue(buffer.append("支付成功 ¥24.88", 4_600L));
        assertEquals("支付成功 ¥24.88", buffer.text(4_600L));
    }
}
