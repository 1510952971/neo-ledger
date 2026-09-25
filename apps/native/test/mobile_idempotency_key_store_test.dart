import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/data/mobile_idempotency_key_store.dart';

void main() {
  late Map<String, String> values;
  late MobileIdempotencyKeyStore store;

  setUp(() {
    values = {};
    store = MobileIdempotencyKeyStore(
      read: (key) async => values[key],
      write: (key, value) async {
        values[key] = value;
      },
      delete: (key) async {
        values.remove(key);
      },
    );
  });

  test('reuses the same key after a retryable request failure', () async {
    String? firstKey;
    await expectLater(
      store.run<void>(
        operation: 'native-transfer',
        request: {'amount': 12.5, 'from': 1, 'to': 2},
        send: (key) async {
          firstKey = key;
          throw StateError('response timed out');
        },
      ),
      throwsStateError,
    );

    final retryKey = await store.run<String>(
      operation: 'native-transfer',
      // Map insertion order does not change the logical request identity.
      request: {'to': 2, 'from': 1, 'amount': 12.5},
      send: (key) async => key,
    );

    expect(firstKey, startsWith('native-transfer-'));
    expect(retryKey, firstKey);
    expect(values, isEmpty, reason: 'confirmed success clears the retry key');
  });

  test('uses a fresh key after success and for a changed request', () async {
    final first = await store.run<String>(
      operation: 'native-transfer',
      request: {'amount': 12.5},
      send: (key) async => key,
    );
    final second = await store.run<String>(
      operation: 'native-transfer',
      request: {'amount': 12.5},
      send: (key) async => key,
    );
    final changed = await store.run<String>(
      operation: 'native-transfer',
      request: {'amount': 13},
      send: (key) async => key,
    );

    expect(second, isNot(first));
    expect(changed, isNot(second));
    expect(first, matches(RegExp(r'^native-transfer-[0-9a-f-]{36}$')));
  });

  test('coalesces concurrent key creation for the same request', () async {
    final sendGate = Completer<void>();
    final observedKeys = <String>[];

    Future<void> runOnce() => store.run<void>(
      operation: 'native-settlement',
      request: {'ledgerId': 4, 'memberId': 9, 'amount': 800},
      send: (key) async {
        observedKeys.add(key);
        await sendGate.future;
      },
    );

    final first = runOnce();
    final second = runOnce();
    await Future<void>.delayed(Duration.zero);
    sendGate.complete();
    await Future.wait([first, second]);

    expect(observedKeys, hasLength(2));
    expect(observedKeys.first, observedKeys.last);
  });

  test(
    'persists only opaque identifiers and fingerprints, not request data',
    () async {
      await expectLater(
        store.run<void>(
          operation: 'native-transfer',
          request: {'note': 'sensitive merchant information', 'amount': 99},
          send: (key) async => throw StateError('offline'),
        ),
        throwsStateError,
      );

      final persisted = values.entries.single;
      expect(persisted.key, startsWith('neo_ledger_idempotency_v1_'));
      expect(persisted.value, startsWith('native-transfer-'));
      expect(persisted.key, isNot(contains('sensitive')));
      expect(persisted.value, isNot(contains('sensitive')));
    },
  );
}
