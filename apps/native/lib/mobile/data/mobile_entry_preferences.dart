import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class MobileEntryPreferences {
  const MobileEntryPreferences();

  static const _recentKey = 'mobile.entry.recentCategories';
  static const _accountPrefix = 'mobile.entry.account.';
  static const _hapticsKey = 'mobile.entry.haptics';
  static const _hideAmountsKey = 'mobile.home.hideAmounts';
  static const _billSearchHistoryKey = 'mobile.bill.searchHistory';
  static const _entryDraftKey = 'mobile.entry.draft';

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

  Future<bool> hapticsEnabled() async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getBool(_hapticsKey) ?? true;
  }

  Future<void> setHapticsEnabled(bool enabled) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool(_hapticsKey, enabled);
  }

  Future<bool> hideAmounts() async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getBool(_hideAmountsKey) ?? false;
  }

  Future<void> setHideAmounts(bool enabled) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool(_hideAmountsKey, enabled);
  }

  Future<List<String>> recentBillSearches() async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getStringList(_billSearchHistoryKey) ?? const [];
  }

  Future<void> rememberBillSearch(String query) async {
    final normalized = query.trim();
    if (normalized.isEmpty) return;
    final preferences = await SharedPreferences.getInstance();
    final recent = preferences.getStringList(_billSearchHistoryKey) ?? const [];
    await preferences.setStringList(
      _billSearchHistoryKey,
      [
        normalized,
        ...recent.where((item) => item != normalized),
      ].take(6).toList(),
    );
  }

  Future<Map<String, dynamic>?> entryDraft() async {
    final preferences = await SharedPreferences.getInstance();
    final encoded = preferences.getString(_entryDraftKey);
    if (encoded == null || encoded.trim().isEmpty) return null;
    try {
      final decoded = jsonDecode(encoded);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) {
        return decoded.map((key, value) => MapEntry(key.toString(), value));
      }
    } catch (_) {
      // A corrupt local draft must never prevent opening the entry page.
    }
    return null;
  }

  Future<void> saveEntryDraft(Map<String, dynamic> draft) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_entryDraftKey, jsonEncode(draft));
  }

  Future<void> clearEntryDraft() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_entryDraftKey);
  }
}
