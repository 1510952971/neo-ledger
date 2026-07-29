package online.eyeme.neoledger.companion;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

final class PaymentNotificationParser {
    static final String WECHAT = "com.tencent.mm";
    static final String ALIPAY = "com.eg.android.AlipayGphone";

    private static final Pattern AMOUNT = Pattern.compile(
            "(?:[¥￥]|人民币|CNY|RMB)\\s*[0-9,]+(?:\\.[0-9]{1,2})?|[0-9,]+(?:\\.[0-9]{1,2})?\\s*元",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PAYMENT = Pattern.compile(
            "付款|支付成功|扣款|消费|支出|收入|交易成功|收款|到账|入账|退款到账|转账成功",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern IGNORE = Pattern.compile(
            "验证码|优惠券|活动|提醒设置|账单还款|余额不足|支付失败|交易失败|退款申请",
            Pattern.CASE_INSENSITIVE);

    static boolean acceptsPackage(String packageName, SettingsStore store) {
        if (WECHAT.equals(packageName)) return store.wechatEnabled();
        if (ALIPAY.equals(packageName)) return store.alipayEnabled();
        Set<String> extra = new HashSet<>();
        Arrays.stream(store.extraPackages().split("[,\\s]+"))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .forEach(extra::add);
        return extra.contains(packageName);
    }

    static boolean isPayment(String text) {
        String normalized = text == null ? "" : text.replaceAll("\\s+", " ").trim();
        return normalized.length() >= 4
                && !IGNORE.matcher(normalized).find()
                && AMOUNT.matcher(normalized).find()
                && PAYMENT.matcher(normalized).find();
    }

    static String amountFingerprint(String text) {
        String normalized = text == null ? "" : text.replaceAll("\\s+", "");
        java.util.regex.Matcher matcher = AMOUNT.matcher(normalized);
        return matcher.find() ? matcher.group().replaceAll("[^0-9.]", "") : "";
    }

    static String source(String packageName) {
        if (WECHAT.equals(packageName)) return "微信";
        if (ALIPAY.equals(packageName)) return "支付宝";
        return packageName.toLowerCase(Locale.ROOT);
    }

    private PaymentNotificationParser() {}
}
