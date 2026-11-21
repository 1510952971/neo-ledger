import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models.dart';

/// Persists pending entries using the existing key so app upgrades keep the
/// user's locally queued transactions intact.
class MobileOfflineQueueStore {
  const MobileOfflineQueueStore(this._preferences, {this.scope});

  static const storageKey = 'neo_ledger_offline_queue_v1';

  final SharedPreferences _preferences;
  final String? scope;

  String get _storageKey => scope == null
      ? storageKey
      : '${storageKey}_${sha256.convert(utf8.encode(scope!)).toString().substring(0, 16)}';

  Future<List<OfflineEntry>> read() async {
    final raw = _preferences.getStringList(_storageKey) ?? const <String>[];
    return raw
        .map(_decodeEntry)
        .whereType<OfflineEntry>()
        .toList(growable: true);
  }

  Future<void> write(List<OfflineEntry> entries) async {
    await _preferences.setStringList(
      _storageKey,
      entries.map((entry) => jsonEncode(entry.toJson())).toList(),
    );
  }

  OfflineEntry? _decodeEntry(String value) {
    try {
      final decoded = jsonDecode(value);
      if (decoded is Map<String, dynamic>) {
        return OfflineEntry.fromJson(decoded);
      }
      if (decoded is Map) {
        return OfflineEntry.fromJson(
          decoded.map((key, value) => MapEntry(key.toString(), value)),
        );
      }
    } catch (_) {
      // One damaged local record must not hide other pending entries.
    }
    return null;
  }
}
