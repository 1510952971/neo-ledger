import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/data/mobile_api_session_store.dart';

void main() {
  late Map<String, String> values;
  late MobileApiSessionStore store;

  setUp(() {
    values = {};
    store = MobileApiSessionStore(
      read: (key) async => values[key],
      write: (key, value) async {
        values[key] = value;
      },
      delete: (key) async {
        values.remove(key);
      },
    );
  });

  test(
    'migrates the old localhost default without losing session secrets',
    () async {
      values[MobileApiSessionStore.baseUrlStorageKey] = 'http://localhost:3000';
      values[MobileApiSessionStore.cookieStorageKey] =
          'neo_ledger_session=saved-session';
      values[MobileApiSessionStore.autoLogSecretStorageKey] = 'auto-log-secret';

      await store.load();

      expect(store.baseUrl, MobileApiSessionStore.defaultBaseUrl);
      expect(store.hasSession, isTrue);
      expect(store.cookie, 'neo_ledger_session=saved-session');
      expect(store.autoLogSecret, 'auto-log-secret');
      expect(
        values[MobileApiSessionStore.baseUrlStorageKey],
        MobileApiSessionStore.defaultBaseUrl,
      );
    },
  );

  test(
    'normalizes server URL and captures only the app session cookie',
    () async {
      await store.setBaseUrl('  https://example.test/  ');
      await store.captureSetCookieHeader(
        'other=value; Path=/, neo_ledger_session=token-123; Secure; HttpOnly',
      );

      expect(store.baseUrl, 'https://example.test');
      expect(store.cookie, 'neo_ledger_session=token-123');
      expect(store.hasSession, isTrue);
      expect(
        values[MobileApiSessionStore.cookieStorageKey],
        'neo_ledger_session=token-123',
      );
    },
  );

  test('logout clears only the session cookie', () async {
    values[MobileApiSessionStore.cookieStorageKey] =
        'neo_ledger_session=saved-session';
    values[MobileApiSessionStore.baseUrlStorageKey] = 'https://example.test';
    values[MobileApiSessionStore.autoLogSecretStorageKey] =
        'integration-secret';
    await store.load();

    await store.logout();

    expect(store.hasSession, isFalse);
    expect(values, {
      MobileApiSessionStore.baseUrlStorageKey: 'https://example.test',
      MobileApiSessionStore.autoLogSecretStorageKey: 'integration-secret',
    });
  });
}
