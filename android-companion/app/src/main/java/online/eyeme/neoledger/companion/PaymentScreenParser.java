package online.eyeme.neoledger.companion;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Strict parser for the visible, current payment-result screen.
 *
 * It deliberately does not treat a payment button, an order page, a bill
 * list, or an amount by itself as a completed payment.
 */
final class PaymentScreenParser {
    private static final Pattern SUCCESS = Pattern.compile(
            "支付成功|付款成功|交易成功|扣款成功|收款成功|支付完成|付款完成|成功支付|购买成功",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern REJECT = Pattern.compile(
            "立即支付|去支付|确认支付|待支付|待付款|账单|交易记录|交易明细|收支记录|付款记录|消费记录|历史订单|历史记录|订单列表|订单详情|账单详情|相册|照片|图片|截图|退款申请|退款中|支付失败|交易失败|余额不足|验证码",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern MONEY = Pattern.compile(
            "(?:金额|实付|实际支付|支付金额|付款金额|收款金额|消费金额)?\\s*(?:[¥￥]|人民币|CNY|RMB)\\s*[0-9,]+(?:\\.[0-9]{1,2})?\\s*元?"
                    + "|(?:金额|实付|实际支付|支付金额|付款金额|收款金额|消费金额)\\s*[:：]?\\s*[0-9,]+(?:\\.[0-9]{1,2})?\\s*元",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern TRANSACTION_ID = Pattern.compile(
            "(?:交易单号|交易号|订单号|商户订单号|流水号)\\s*[:：#]?\\s*([A-Za-z0-9_-]{6,64})",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern TIME = Pattern.compile(
            "(?:20\\d{2}[-/]\\d{1,2}[-/]\\d{1,2}\\s*)?\\d{1,2}:\\d{2}");

    private PaymentScreenParser() {}

    static boolean isPaymentCompleted(String packageName, String text) {
        String normalized = normalize(text);
        return normalized.length() >= 8
                && !REJECT.matcher(normalized).find()
                && SUCCESS.matcher(normalized).find()
                && !PaymentNotificationParser.amountFingerprint(normalized).isEmpty()
                && (normalized.contains("支付") || normalized.contains("付款")
                || normalized.contains("交易") || normalized.contains("扣款")
                || normalized.contains("收款") || normalized.contains("购买成功"));
    }

    /** Returns a compact payload without forwarding unrelated screen content. */
    static String payload(String packageName, String text) {
        String normalized = normalize(text);
        String source = PaymentAppCatalog.source(packageName);
        String amount = PaymentNotificationParser.amountFingerprint(normalized);
        StringBuilder result = new StringBuilder("【").append(source)
                .append("】支付成功，金额 ¥").append(amount).append("元");
        Matcher id = TRANSACTION_ID.matcher(normalized);
        if (id.find()) result.append("，交易号 ").append(id.group(1));
        String relevant = relevantText(normalized);
        if (!relevant.isEmpty()) result.append("，").append(relevant);
        return result.toString();
    }

    /** Stable across accessibility re-layouts, but distinguishes real payments when possible. */
    static String identity(String packageName, String text) {
        String normalized = normalize(text);
        String amount = PaymentNotificationParser.amountFingerprint(normalized);
        Matcher id = TRANSACTION_ID.matcher(normalized);
        if (id.find()) return packageName + "|screen|amount=" + amount + "|transaction=" + id.group(1);
        Matcher time = TIME.matcher(normalized);
        String timePart = time.find() ? time.group() : "";
        return packageName + "|screen|amount=" + amount + "|payment|" + timePart + "|" + relevantText(normalized);
    }

    private static String relevantText(String text) {
        StringBuilder result = new StringBuilder();
        String[] parts = text.split("[，,。.!！?？\\n|]+", -1);
        for (String part : parts) {
            String value = part.trim();
            if (value.isEmpty() || value.length() > 80) continue;
            if (MONEY.matcher(value).find()
                    || SUCCESS.matcher(value).find()
                    || value.contains("商户") || value.contains("收款方")
                    || value.contains("付款方") || value.contains("支付方式")) {
                if (result.length() > 0) result.append("，");
                result.append(value);
            }
            if (result.length() >= 420) break;
        }
        return result.length() > 480 ? result.substring(0, 480) : result.toString();
    }

    private static String normalize(String text) {
        return text == null ? "" : text.replaceAll("[\\u200B-\\u200D\\uFEFF]", "")
                .replaceAll("\\s+", " ").trim().toLowerCase(Locale.ROOT);
    }
}
