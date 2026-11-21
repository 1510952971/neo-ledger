import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Stores the last signed-in core snapshot without changing its upgrade key.
class MobileCoreSnapshotStore {
  const MobileCoreSnapshotStore(this._preferences, {this.scope});

  static const storageKey = 'neo_ledger_core_snapshot_v1';

  final SharedPreferences _preferences;
  final String? scope;

  String get _storageKey => scope == null
      ? storageKey
      : '${storageKey}_${sha256.convert(utf8.encode(scope!)).toString().substring(0, 16)}';

  Future<Map<String, dynamic>?> read() async {
    final raw = _preferences.getString(_storageKey);
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
    await _preferences.setString(_storageKey, jsonEncode(snapshot));
  }

  Future<void> clear() async {
    await _preferences.remove(_storageKey);
  }
}
