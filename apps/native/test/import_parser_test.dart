import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/import_parser.dart';

void main() {
  test('converts the Web export transaction array from cents to yuan', () {
    final records = LedgerImportParser.parse('''
      {"version":23,"transactions":[{"title":"奶茶","amount":1288,"occurredAt":"2026-08-31T08:01:02","type":"expense","source":"wechat","crdtId":"web-1"}]}
    ''');

    expect(records, hasLength(1));
    expect(records.single['merchant'], '奶茶');
    expect(records.single['amount'], closeTo(12.88, 0.000001));
    expect(records.single['externalId'], 'web-1');
    expect(records.single['type'], '支出');
  });

  test('keeps ordinary user JSON amounts in yuan', () {
    final records = LedgerImportParser.parse('''
      [{"title":"午餐","amount":12.5,"date":"2026-08-31 12:00","type":"支出"}]
    ''');

    expect(records.single['merchant'], '午餐');
    expect(records.single['amount'], closeTo(12.5, 0.000001));
    expect(records.single['occurredAt'], '2026-08-31 12:00:00');
  });

  test('supports explicit amountCents in ordinary JSON', () {
    final records = LedgerImportParser.parse('''
      [{"merchant":"电影","amountCents":880,"date":"2026-08-31"}]
    ''');

    expect(records.single['amount'], closeTo(8.8, 0.000001));
  });

  test('parses CSV aliases, quoted commas, currency and source', () {
    final records = LedgerImportParser.parse('''
      日期,商户,金额（元）,收支,来源
      2026/08/31 08:01,"咖啡,店",￥12.50,支出,微信支付
    ''');

    expect(records, hasLength(1));
    expect(records.single['merchant'], '咖啡,店');
    expect(records.single['amount'], closeTo(12.5, 0.000001));
    expect(records.single['source'], '微信支付');
    expect(records.single['occurredAt'], '2026-08-31 08:01:00');
  });

  test('rejects a JSON object without a supported record array', () {
    expect(
      () => LedgerImportParser.parse('{"hello":"world"}'),
      throwsA(isA<FormatException>()),
    );
  });
}
