import 'package:intl/intl.dart';

/// Formats values stored in the ledger's two-decimal minor-unit convention.
class MobileMoneyFormatter {
  static const _symbols = <String, String>{
    'CNY': '¥',
    'USD': r'$',
    'EUR': '€',
    'JPY': '¥',
  };

  static String format(
    int cents, {
    String currency = 'CNY',
    String locale = 'zh_CN',
  }) {
    final code = _symbols.containsKey(currency) ? currency : 'CNY';
    return NumberFormat.currency(
      locale: locale,
      name: code,
      symbol: _symbols[code],
      decimalDigits: code == 'JPY' ? 0 : 2,
    ).format(cents / 100);
  }
}
