import 'package:shared_preferences/shared_preferences.dart';

class MobileEntryPreferences {
  const MobileEntryPreferences();

  static const _recentKey = 'mobile.entry.recentCategories';
  static const _accountPrefix = 'mobile.entry.account.';

  Future<List<String>> recentCategories() async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getStringList(_recentKey) ?? const [];
  }

  Future<int?> accountForCategory(String category) async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getInt('$_accountPrefix$category');
  }

  Future<void> remember({
    required String category,
    required int accountId,
  }) async {
    final preferences = await SharedPreferences.getInstance();
    final recent = preferences.getStringList(_recentKey) ?? const [];
    final updated = [
      category,
      ...recent.where((item) => item != category),
    ].take(8).toList();
    await preferences.setStringList(_recentKey, updated);
    await preferences.setInt('$_accountPrefix$category', accountId);
  }
}
