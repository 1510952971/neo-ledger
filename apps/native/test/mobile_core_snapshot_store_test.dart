import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/data/mobile_core_snapshot_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('writes and reads the existing core snapshot format', () async {
    SharedPreferences.setMockInitialValues({});
    final preferences = await SharedPreferences.getInstance();
    final store = MobileCoreSnapshotStore(preferences);
    const snapshot = {
      'user': {'id': 12, 'name': 'Peng'},
      'ledgers': [
        {'id': 4, 'name': '家庭账本'},
      ],
      'selectedLedgerIndex': 0,
    };

    await store.write(snapshot);

    expect(await store.read(), snapshot);
    expect(preferences.containsKey('neo_ledger_core_snapshot_v1'), isTrue);
  });

  test('returns null for absent, corrupt, or non-object snapshots', () async {
    SharedPreferences.setMockInitialValues({
      'neo_ledger_core_snapshot_v1': '{broken-json',
    });
    final preferences = await SharedPreferences.getInstance();
    final store = MobileCoreSnapshotStore(preferences);

    expect(await store.read(), isNull);
    await preferences.setString(
      MobileCoreSnapshotStore.storageKey,
      '["not", "an object"]',
    );
    expect(await store.read(), isNull);
    await store.write({'unexpected': 'shape'});
    expect(await store.read(), {'unexpected': 'shape'});
    await store.clear();
    expect(await store.read(), isNull);
  });

  test('continues reading snapshots written by earlier app versions', () async {
    SharedPreferences.setMockInitialValues({
      'neo_ledger_core_snapshot_v1': '{"selectedLedgerIndex":2}',
    });
    final preferences = await SharedPreferences.getInstance();
    final store = MobileCoreSnapshotStore(preferences);

    expect(await store.read(), {'selectedLedgerIndex': 2});
  });
}
