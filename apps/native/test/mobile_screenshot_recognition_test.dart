import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/domain/mobile_screenshot_recognition.dart';

void main() {
  group('parseMobileScreenshotText', () {
    test('extracts conservative expense fields and completeness score', () {
      final result = parseMobileScreenshotText('''
支付成功
商户名称：便利店
实付金额：¥ 18.80
交易时间：2026-09-23 18:30
订单号：420000123456789
''');

      expect(result.amount, 18.8);
      expect(result.merchant, '便利店');
      expect(result.occurredAt, DateTime(2026, 9, 23));
      expect(result.type, '支出');
      expect(result.typeWasInferred, isFalse);
      expect(result.fieldCompleteness, 100);
      expect(result.redactedText, contains('[编号已隐藏]'));
    });

    test(
      'detects income and does not mistake a date or phone for an amount',
      () {
        final result = parseMobileScreenshotText('''
收款成功
到账时间：2026年9月23日
联系电话：13800138000
''');

        expect(result.type, '收入');
        expect(result.amount, isNull);
        expect(result.occurredAt, DateTime(2026, 9, 23));
        expect(result.redactedText, contains('[手机号已隐藏]'));
      },
    );

    test('redacts ID, card, order reference, and address but keeps amount', () {
      const text = '''
金额：¥ 36.50
身份证号：11010519491231002X
银行卡：6222021234567890123
交易单号 A1202609239981
收货地址：北京市朝阳区某某路 1 号
''';

      final redacted = redactMobileScreenshotText(text);

      expect(redacted, contains('¥ 36.50'));
      expect(redacted, contains('[证件号已隐藏]'));
      expect(redacted, contains('[卡号已隐藏]'));
      expect(redacted, contains('交易单号：[编号已隐藏]'));
      expect(redacted, contains('收货地址：[地址已隐藏]'));
      expect(redacted, isNot(contains('11010519491231002X')));
      expect(redacted, isNot(contains('6222021234567890123')));
    });

    test('invalid dates and out-of-range amounts remain unset', () {
      final result = parseMobileScreenshotText('''
支付金额：999999999999.00
交易时间：2026-02-30
''');

      expect(result.amount, isNull);
      expect(result.occurredAt, isNull);
      expect(result.typeWasInferred, isFalse);
    });
  });
}
