package online.eyeme.neoledger.companion;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class NotificationEventIdentityTest {
    @Test
    public void textUpdatesKeepTheSameIdentity() {
        assertEquals(
                NotificationEventIdentity.fingerprint(
                        "com.eg.android.AlipayGphone", "notification-key", "支付宝支付 ¥0.01"),
                NotificationEventIdentity.fingerprint(
                        "com.eg.android.AlipayGphone", "notification-key", "支付宝交易提醒：已支付 0.01 元，点击查看详情"));
    }

    @Test
    public void differentNotificationKeysRemainDifferentEvents() {
        String first = NotificationEventIdentity.fingerprint(
                "com.eg.android.AlipayGphone", "notification-one", "支付宝支付 ¥0.01");
        String second = NotificationEventIdentity.fingerprint(
                "com.eg.android.AlipayGphone", "notification-two", "支付宝支付 ¥0.01");
        org.junit.Assert.assertNotEquals(first, second);
    }
}
