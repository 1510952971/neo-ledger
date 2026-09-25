import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/data/mobile_local_cache_store.dart';
import 'package:neo_ledger/mobile/data/mobile_offline_queue_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('clears disposable cache but preserves settings and pending financial queue', () async {
    SharedPreferences.setMockInitialValues({
      'neo_ledger_core_snapshot_v1': '{"ledgers":[]}',
      'mobile.entry.recentCategories': ['餐饮'],
      'mobile.entry.account.餐饮': 3,
      'mobile.bill.searchHistory': ['咖啡'],
      'mobile.bill.filterHistory': ['{}'],
      'mobile.entry.draft': '{"amount":"12"}',
      'mobile.entry.haptics': false,
      'mobile.home.hideAmounts': true,
      MobileOfflineQueueStore.storageKey: ['pending'],
    });
    final preferences = await SharedPreferences.getInstance();

    final removed = await MobileLocalCacheStore(preferences)
        .clearDisposableCache();

    expect(removed, 6);
    expect(preferences.containsKey('neo_ledger_core_snapshot_v1'), isFalse);
    expect(preferences.containsKey('mobile.entry.recentCategories'), isFalse);
    expect(preferences.containsKey('mobile.entry.account.餐饮'), isFalse);
    expect(preferences.containsKey('mobile.bill.searchHistory'), isFalse);
    expect(preferences.containsKey('mobile.bill.filterHistory'), isFalse);
    expect(preferences.containsKey('mobile.entry.draft'), isFalse);
    expect(preferences.getBool('mobile.entry.haptics'), isFalse);
    expect(preferences.getBool('mobile.home.hideAmounts'), isTrue);
    expect(preferences.getStringList(MobileOfflineQueueStore.storageKey), [
      'pending',
    ]);
  });
}
