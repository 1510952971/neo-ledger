package online.eyeme.neoledger.companion;

import java.util.Locale;
import java.time.DateTimeException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Strict parser for the visible, current payment-result screen.
 *
 * It deliberately does not treat a payment button, an order page, a bill
 * list, or an amount by itself as a completed payment.
 */
final class PaymentScreenParser {
    private static final Pattern PAYMENT_SUCCESS = Pattern.compile(
            "支付成功|付款成功|交易成功|扣款成功|收款成功|支付完成|付款完成|成功支付",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PURCHASE_SUCCESS = Pattern.compile("购买成功", Pattern.CASE_INSENSITIVE);
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
    private static final Pattern PAYMENT_METADATA = Pattern.compile(
            "支付方式|付款方式|支付时间|付款时间|交易时间|抖音月付|支付宝|微信支付|花呗|银行卡|云闪付",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PAYMENT_DATE_TIME = Pattern.compile(
            "(?:支付时间|付款时间|交易时间)\\s*[:：]?\\s*(20\\d{2})[-/](\\d{1,2})[-/](\\d{1,2})\\s+(\\d{1,2}):(\\d{2})",
            Pattern.CASE_INSENSITIVE);
    private static final long PAYMENT_TIME_TOLERANCE_MILLIS = 10L * 60L * 1000L;
    private static final int NEARBY_REJECT_DISTANCE = 120;

    private PaymentScreenParser() {}

    static boolean isPaymentCompleted(String packageName, String text) {
        return isPaymentCompleted(packageName, text, System.currentTimeMillis());
    }

    static boolean isPaymentCompleted(String packageName, String text, long nowMillis) {
        return "已识别".equals(decisionReason(packageName, text, nowMillis));
    }

    static String rejectionReason(String packageName, String text) {
        return decisionReason(packageName, text, System.currentTimeMillis());
    }

    static String rejectionReason(String packageName, String text, long nowMillis) {
        return decisionReason(packageName, text, nowMillis);
    }

    private static String decisionReason(String packageName, String text, long nowMillis) {
        String normalized = normalize(text);
        if (normalized.length() < 8) return "可见文本不足";

        Matcher paymentSuccess = PAYMENT_SUCCESS.matcher(normalized);
        if (!paymentSuccess.find()) {
            if (PURCHASE_SUCCESS.matcher(normalized).find()) {
                return "仅购买成功页，未检测到支付成功语义";
            }
            return "未检测到支付成功或购买成功文字";
        }

        if (amountFingerprint(normalized).isEmpty()) return "未检测到明确金额";

        String successContext = successContext(normalized, paymentSuccess.start(), paymentSuccess.end());
        if (hasNearbyReject(normalized, paymentSuccess.start(), paymentSuccess.end())) {
            boolean currentPaymentSheet = PAYMENT_METADATA.matcher(successContext).find()
                    && hasFreshPaymentTime(normalized, nowMillis);
            if (!currentPaymentSheet) return "命中订单/历史等非完成页关键词";
        }
        return "已识别";
    }

    /**
     * Prefer an amount close to the success marker. Payment overlays often
     * leave the product price visible behind them, so the first amount in the
     * complete screen is not necessarily the amount that was paid.
     */
    static String amountFingerprint(String text) {
        String normalized = normalize(text);
        Matcher success = PAYMENT_SUCCESS.matcher(normalized);
        if (success.find()) {
            int end = Math.min(normalized.length(), success.end() + 420);
            String nearby = normalized.substring(success.start(), end);
            String amount = PaymentNotificationParser.amountFingerprint(nearby);
            if (!amount.isEmpty()) return amount;
        }
        return PaymentNotificationParser.amountFingerprint(normalized);
    }

    /**
     * Only reject order/history words that belong to the result area. A transient
     * payment sheet is rendered over the merchant page, whose still-visible
     * accessibility nodes can contain unrelated words such as "订单详情".
     */
    private static boolean hasNearbyReject(String text, int successStart, int successEnd) {
        Matcher reject = REJECT.matcher(text);
        while (reject.find()) {
            int distance;
            if (reject.end() < successStart) {
                distance = successStart - reject.end();
            } else if (reject.start() > successEnd) {
                distance = reject.start() - successEnd;
            } else {
                distance = 0;
            }
            if (distance <= NEARBY_REJECT_DISTANCE) return true;
        }
        return false;
    }

    private static String successContext(String text, int successStart, int successEnd) {
        int start = Math.max(0, successStart - 40);
        int end = Math.min(text.length(), successEnd + 520);
        return text.substring(start, end);
    }

    /**
     * A nearby order/history word may be part of the merchant page behind a
     * payment sheet. It is only overridden when the sheet exposes a payment
     * timestamp matching the current event, preventing old order details from
     * being imported when the user merely views them.
     */
    private static boolean hasFreshPaymentTime(String text, long nowMillis) {
        Matcher time = PAYMENT_DATE_TIME.matcher(text);
        while (time.find()) {
            try {
                LocalDateTime captured = LocalDateTime.of(
                        Integer.parseInt(time.group(1)),
                        Integer.parseInt(time.group(2)),
                        Integer.parseInt(time.group(3)),
                        Integer.parseInt(time.group(4)),
                        Integer.parseInt(time.group(5)));
                long capturedMillis = captured.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
                if (Math.abs(nowMillis - capturedMillis) <= PAYMENT_TIME_TOLERANCE_MILLIS) return true;
            } catch (DateTimeException | NumberFormatException ignored) {
                // Keep scanning in case another visible timestamp is valid.
            }
        }
        return false;
    }

    /** Returns a compact payload without forwarding unrelated screen content. */
    static String payload(String packageName, String text) {
        String normalized = normalize(text);
        String source = PaymentAppCatalog.source(packageName);
        String amount = amountFingerprint(normalized);
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
        String amount = amountFingerprint(normalized);
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
