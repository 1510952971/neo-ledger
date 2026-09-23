import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/data/mobile_entry_preferences.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'remembers recent categories and their accounts without duplicates',
    () async {
      SharedPreferences.setMockInitialValues({});
      const preferences = MobileEntryPreferences();

      await preferences.remember(category: '餐饮', accountId: 2);
      await preferences.remember(category: '交通', accountId: 3);
      await preferences.remember(category: '餐饮', accountId: 4);

      expect(await preferences.recentCategories(), ['餐饮', '交通']);
      expect(await preferences.accountForCategory('餐饮'), 4);
      expect(await preferences.accountForCategory('交通'), 3);
    },
  );

  test('haptics default on and remain configurable', () async {
    SharedPreferences.setMockInitialValues({});
    const preferences = MobileEntryPreferences();

    expect(await preferences.hapticsEnabled(), isTrue);
    await preferences.setHapticsEnabled(false);
    expect(await preferences.hapticsEnabled(), isFalse);
  });

  test('stores and clears a failed entry draft', () async {
    SharedPreferences.setMockInitialValues({});
    const preferences = MobileEntryPreferences();

    await preferences.saveEntryDraft({
      'type': '支出',
      'amount': '12.50',
      'tags': '工作,报销',
      'reimbursable': true,
    });

    expect(await preferences.entryDraft(), {
      'type': '支出',
      'amount': '12.50',
      'tags': '工作,报销',
      'reimbursable': true,
    });

    await preferences.clearEntryDraft();
    expect(await preferences.entryDraft(), isNull);
  });

  test(
    'remembers bounded bill filter history and ignores corrupt entries',
    () async {
      SharedPreferences.setMockInitialValues({
        'mobile.bill.filterHistory': ['not-json'],
      });
      const preferences = MobileEntryPreferences();

      expect(await preferences.recentBillFilters(), isEmpty);
      await preferences.rememberBillFilter({
        'label': '支出 · 现金账户',
        'type': '支出',
        'accountId': 2,
      });

      final filters = await preferences.recentBillFilters();
      expect(filters.single['label'], '支出 · 现金账户');
      expect(filters.single['accountId'], 2);
    },
  );
}
