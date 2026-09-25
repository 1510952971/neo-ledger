import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/l10n/generated/app_localizations.dart';

void main() {
  test('Chinese ARB contains the native shell and entry essentials', () async {
    final strings = await AppLocalizations.delegate.load(const Locale('zh'));

    expect(strings.appTitle, 'Neo Ledger');
    expect(strings.home, '首页');
    expect(strings.quickEntry, '记一笔');
    expect(strings.expense, '支出');
    expect(strings.income, '收入');
    expect(strings.transfer, '转账');
    expect(strings.saveEntry, '保存');
  });
}
