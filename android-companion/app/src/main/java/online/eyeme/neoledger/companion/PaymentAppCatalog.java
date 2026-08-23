package online.eyeme.neoledger.companion;

import java.util.Locale;

/** Package allow-list and user-facing names for payment-capable apps. */
final class PaymentAppCatalog {
    static final String TAOBAO = "com.taobao.taobao";
    static final String JD = "com.jingdong.app.mall";
    static final String MEITUAN = "com.sankuai.meituan";
    static final String PINDUODUO = "com.xunmeng.pinduoduo";
    static final String ELEME = "me.ele";
    static final String UNIONPAY = "com.unionpay";
    static final String DOUYIN = "com.ss.android.ugc.aweme";
    static final String DOUYIN_LITE = "com.ss.android.ugc.aweme.lite";
    static final String XIAOHONGSHU = "com.xingin.xhs";
    static final String XIANYU = "com.taobao.idlefish";

    private PaymentAppCatalog() {}

    static boolean isMarketApp(String packageName) {
        return TAOBAO.equals(packageName)
                || JD.equals(packageName)
                || MEITUAN.equals(packageName)
                || PINDUODUO.equals(packageName)
                || ELEME.equals(packageName)
                || UNIONPAY.equals(packageName)
                || DOUYIN.equals(packageName)
                || DOUYIN_LITE.equals(packageName)
                || XIAOHONGSHU.equals(packageName)
                || XIANYU.equals(packageName);
    }

    static String source(String packageName) {
        if (PaymentNotificationParser.WECHAT.equals(packageName)) return "微信";
        if (PaymentNotificationParser.ALIPAY.equals(packageName)) return "支付宝";
        if (TAOBAO.equals(packageName)) return "淘宝";
        if (JD.equals(packageName)) return "京东";
        if (MEITUAN.equals(packageName)) return "美团";
        if (PINDUODUO.equals(packageName)) return "拼多多";
        if (ELEME.equals(packageName)) return "饿了么";
        if (UNIONPAY.equals(packageName)) return "云闪付";
        if (DOUYIN.equals(packageName) || DOUYIN_LITE.equals(packageName)) return "抖音";
        if (XIAOHONGSHU.equals(packageName)) return "小红书";
        if (XIANYU.equals(packageName)) return "闲鱼";
        return packageName == null ? "未知支付应用" : packageName.toLowerCase(Locale.ROOT);
    }
}
