package online.eyeme.neoledger.companion;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class PaymentNotificationParserTest {
    @Test
    public void acceptsPaymentAndReceiptNotifications() {
        assertTrue(PaymentNotificationParser.isPayment("微信支付：向星巴克付款￥35.50"));
        assertTrue(PaymentNotificationParser.isPayment("支付宝收款到账 88.00元"));
        assertTrue(PaymentNotificationParser.isPayment("银行卡消费人民币1,280.00元"));
        assertTrue(PaymentNotificationParser.isPayment("微信支付成功，金额 ¥12.00"));
        assertTrue(PaymentNotificationParser.isPayment("支付宝提醒：你有一笔 26.80 元的支出"));
        assertTrue(PaymentNotificationParser.isPayment("抖音支付：支付成功 ¥7.90"));
        assertTrue(PaymentNotificationParser.isPayment("小红书支付成功，实付 ¥18.88"));
        assertTrue(PaymentNotificationParser.isPayment("闲鱼交易成功，付款 12.50 元"));
    }

    @Test
    public void ignoresOrdinaryMessagesAndAmountFreeNotifications() {
        assertFalse(PaymentNotificationParser.isPayment("微信：小明发来一条消息"));
        assertFalse(PaymentNotificationParser.isPayment("支付宝：服务提醒"));
        assertFalse(PaymentNotificationParser.isPayment("今日步数 12800"));
        assertFalse(PaymentNotificationParser.isPayment("支付失败，余额不足 ¥12.00"));
        assertFalse(PaymentNotificationParser.isPayment("领取支付优惠券 ¥5.00"));
    }

    @Test
    public void normalizesAmountForNotificationUpdateDeduplication() {
        assertEquals("35.50", PaymentNotificationParser.amountFingerprint("付款 ￥ 35.50 元"));
        assertEquals("88.00", PaymentNotificationParser.amountFingerprint("到账 88.00 元"));
    }
}
