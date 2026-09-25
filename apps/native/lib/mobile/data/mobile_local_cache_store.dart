import 'package:shared_preferences/shared_preferences.dart';

import 'mobile_core_snapshot_store.dart';
import 'mobile_entry_preferences.dart';
import 'mobile_offline_queue_store.dart';

/// Clears disposable local UI/cache state without touching credentials, the
/// offline financial queue, or anything on the server.
class MobileLocalCacheStore {
  const MobileLocalCacheStore(this._preferences);

  final SharedPreferences _preferences;

  Future<int> clearDisposableCache() async {
    final keys = _preferences.getKeys().where(_isDisposableKey).toList();
    for (final key in keys) {
      await _preferences.remove(key);
    }
    return keys.length;
  }

  bool _isDisposableKey(String key) {
    if (key == MobileCoreSnapshotStore.storageKey ||
        key == MobileEntryPreferences.recentCategoriesKey ||
        key == MobileEntryPreferences.recentBillSearchHistoryKey ||
        key == MobileEntryPreferences.recentBillFilterHistoryKey ||
        key == MobileEntryPreferences.entryDraftKey) {
      return true;
    }
    return key.startsWith(MobileEntryPreferences.accountPrefix);
  }

  bool hasPendingQueue() =>
      _preferences.containsKey(MobileOfflineQueueStore.storageKey);
}
