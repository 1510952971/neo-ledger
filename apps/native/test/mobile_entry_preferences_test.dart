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
}
