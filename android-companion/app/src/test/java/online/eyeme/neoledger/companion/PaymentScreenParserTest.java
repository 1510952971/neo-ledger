package online.eyeme.neoledger.companion;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class PaymentScreenParserTest {
    @Test
    public void acceptsVisibleCompletedPayment() {
        assertTrue(PaymentScreenParser.isPaymentCompleted(
                PaymentAppCatalog.TAOBAO,
                "支付成功 商户：某某旗舰店 实付 ¥35.50 元 支付方式：支付宝"));
        assertTrue(PaymentScreenParser.isPaymentCompleted(
                PaymentAppCatalog.MEITUAN,
                "付款成功，金额 26.00 元，收款方：美团外卖"));
        assertTrue(PaymentScreenParser.isPaymentCompleted(
                PaymentAppCatalog.DOUYIN,
                "支付成功，实付 ¥7.90 元，商户：抖音商城"));
        assertTrue(PaymentScreenParser.isPaymentCompleted(
                PaymentAppCatalog.DOUYIN,
                "支付成功 ¥18.88 立减优惠 -¥0.02 支付方式 抖音月付 支付时间 2026-08-23 15:56 6抖音支付积分 领取 附近神券 活动"));
        assertTrue(PaymentScreenParser.isPaymentCompleted(
                PaymentAppCatalog.DOUYIN,
                "购买成功 支付成功 团购频道 限时秒杀已额外省2元 渝八两 鸡公煲米饭套餐 ¥16.99 查看订单"));
    }

    @Test
    public void rejectsPaymentPageBeforeConfirmation() {
        assertFalse(PaymentScreenParser.isPaymentCompleted(
                PaymentAppCatalog.JD,
                "订单确认 付款金额 ¥35.50 元 立即支付"));
        assertFalse(PaymentScreenParser.isPaymentCompleted(
                PaymentAppCatalog.MEITUAN,
                "待付款 金额 26.00 元 去支付"));
    }

    @Test
    public void rejectsHistoryAndPhotoScreens() {
        assertFalse(PaymentScreenParser.isPaymentCompleted(
                PaymentAppCatalog.TAOBAO,
                "账单记录：支付成功 ¥35.50 元，查看历史订单"));
        assertFalse(PaymentScreenParser.isPaymentCompleted(
                PaymentAppCatalog.JD,
                "订单详情：支付成功 ¥35.50 元"));
        assertFalse(PaymentScreenParser.isPaymentCompleted(
                PaymentAppCatalog.JD,
                "照片 ¥35.50 元"));
        assertFalse(PaymentScreenParser.isPaymentCompleted(
                PaymentAppCatalog.DOUYIN,
                "刚刚抢购成功 商品 ¥24.90 立即配送 详情"));
    }

    @Test
    public void transactionNumberMakesIdentityStable() {
        String first = PaymentScreenParser.identity(
                PaymentAppCatalog.MEITUAN,
                "支付成功 ¥26.00 元 交易号：TX202608210001");
        String second = PaymentScreenParser.identity(
                PaymentAppCatalog.MEITUAN,
                "支付成功 ¥26.00 元 交易号：TX202608210001 支付方式：微信");
        assertEquals(first, second);
    }

    @Test
    public void prefersAmountNearPaymentSuccessOverBackgroundProductPrice() {
        assertEquals("19.88", PaymentScreenParser.amountFingerprint(
                "商品 ¥19.90 详情 支付成功 ¥19.88 立减优惠 -¥0.02 支付方式 抖音月付"));
    }

    @Test
    public void rejectsPurchaseSuccessWithoutPaymentSemantics() {
        assertFalse(PaymentScreenParser.isPaymentCompleted(
                PaymentAppCatalog.DOUYIN,
                "购买成功 团购频道 限时秒杀已额外省2元 商品 ¥16.99 查看订单"));
    }
}
