import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class MobileEntryPreferences {
  const MobileEntryPreferences();

  static const recentCategoriesKey = 'mobile.entry.recentCategories';
  static const accountPrefix = 'mobile.entry.account.';
  static const _hapticsKey = 'mobile.entry.haptics';
  static const _hideAmountsKey = 'mobile.home.hideAmounts';
  static const recentBillSearchHistoryKey = 'mobile.bill.searchHistory';
  static const recentBillFilterHistoryKey = 'mobile.bill.filterHistory';
  static const entryDraftKey = 'mobile.entry.draft';

  Future<List<String>> recentCategories() async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getStringList(recentCategoriesKey) ?? const [];
  }

  Future<int?> accountForCategory(String category) async {
    final preferences = await SharedPreferences.getInstance();
    return preferences.getInt('$accountPrefix$category');
  }

  Future<void> remember({
    required String category,
    required int accountId,
  }) async {
    final preferences = await SharedPreferences.getInstance();
    final recent = preferences.getStringList(recentCategoriesKey) ?? const [];
    final updated = [
      category,
      ...recent.where((item) => item != category),
    ].take(8).toList();
    await preferences.setStringList(recentCategoriesKey, updated);
    await preferences.setInt('$accountPrefix$category', accountId);
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
    return preferences.getStringList(recentBillSearchHistoryKey) ?? const [];
  }

  Future<void> rememberBillSearch(String query) async {
    final normalized = query.trim();
    if (normalized.isEmpty) return;
    final preferences = await SharedPreferences.getInstance();
    final recent =
        preferences.getStringList(recentBillSearchHistoryKey) ?? const [];
    await preferences.setStringList(
      recentBillSearchHistoryKey,
      [
        normalized,
        ...recent.where((item) => item != normalized),
      ].take(6).toList(),
    );
  }

  Future<List<Map<String, dynamic>>> recentBillFilters() async {
    final preferences = await SharedPreferences.getInstance();
    final raw =
        preferences.getStringList(recentBillFilterHistoryKey) ?? const [];
    final filters = <Map<String, dynamic>>[];
    for (final encoded in raw) {
      try {
        final decoded = jsonDecode(encoded);
        if (decoded is Map<String, dynamic>) {
          filters.add(decoded);
        } else if (decoded is Map) {
          filters.add(
            decoded.map((key, value) => MapEntry(key.toString(), value)),
          );
        }
      } catch (_) {
        // Corrupt local history must never block the bill page.
      }
    }
    return filters;
  }

  Future<void> rememberBillFilter(Map<String, dynamic> filter) async {
    final label = filter['label'];
    if (label is! String || label.trim().isEmpty) return;
    final preferences = await SharedPreferences.getInstance();
    final encoded = jsonEncode(filter);
    final recent =
        preferences.getStringList(recentBillFilterHistoryKey) ?? const [];
    await preferences.setStringList(
      recentBillFilterHistoryKey,
      [encoded, ...recent.where((item) => item != encoded)].take(6).toList(),
    );
  }

  Future<Map<String, dynamic>?> entryDraft() async {
    final preferences = await SharedPreferences.getInstance();
    final encoded = preferences.getString(entryDraftKey);
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
    await preferences.setString(entryDraftKey, jsonEncode(draft));
  }

  Future<void> clearEntryDraft() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(entryDraftKey);
  }
}
