import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Stores the last signed-in core snapshot without changing its upgrade key.
class MobileCoreSnapshotStore {
  const MobileCoreSnapshotStore(this._preferences);

  static const storageKey = 'neo_ledger_core_snapshot_v1';

  final SharedPreferences _preferences;

  Future<Map<String, dynamic>?> read() async {
    final raw = _preferences.getString(storageKey);
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) {
        return decoded.map((key, value) => MapEntry(key.toString(), value));
      }
    } catch (_) {
      // A stale or partially written snapshot must never prevent login.
    }
    return null;
  }

  Future<void> write(Map<String, dynamic> snapshot) async {
    await _preferences.setString(storageKey, jsonEncode(snapshot));
  }

  Future<void> clear() async {
    await _preferences.remove(storageKey);
  }
}
