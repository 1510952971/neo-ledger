import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/domain/mobile_money_formatter.dart';

void main() {
  test('formats grouped money with the selected currency symbol', () {
    expect(MobileMoneyFormatter.format(123456789), '¥1,234,567.89');
    expect(
      MobileMoneyFormatter.format(123456789, currency: 'USD'),
      r'$1,234,567.89',
    );
    expect(
      MobileMoneyFormatter.format(123456789, currency: 'EUR'),
      '€1,234,567.89',
    );
    expect(
      MobileMoneyFormatter.format(123456789, currency: 'JPY'),
      '¥1,234,568',
    );
  });

  test('unknown currencies use the safe account default', () {
    expect(MobileMoneyFormatter.format(1234, currency: 'UNKNOWN'), '¥12.34');
  });
}
