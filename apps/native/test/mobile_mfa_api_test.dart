import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:neo_ledger/api_client.dart';
import 'package:neo_ledger/mobile/data/mobile_api_session_store.dart';
import 'package:neo_ledger/mobile/data/mobile_api_transport.dart';

void main() {
  test(
    'native MFA actions use the authenticated shared API contract',
    () async {
      final storage = <String, String>{
        MobileApiSessionStore.baseUrlStorageKey: 'https://ledger.example',
        MobileApiSessionStore.cookieStorageKey: 'neo_ledger_session=secret',
      };
      final persistedWrites = <String>[];
      final session = MobileApiSessionStore(
        read: (key) async => storage[key],
        write: (key, value) async {
          storage[key] = value;
          persistedWrites.add(value);
        },
        delete: (key) async => storage.remove(key),
      );
      await session.load();
      final requests =
          <({String method, String path, Map<String, dynamic>? body})>[];
      final transport = MobileApiTransport(
        session: session,
        request: (method, uri, headers, rawBody) async {
          requests.add((
            method: method,
            path: uri.path,
            body: rawBody == null
                ? null
                : jsonDecode(rawBody) as Map<String, dynamic>,
          ));
          final response = switch ((method, rawBody)) {
            ('GET', _) => {'enabled': false, 'recoveryCodesRemaining': 0},
            ('POST', final body) when body!.contains('"action":"begin"') => {
              'secret': 'TEMPORARYSECRET',
              'uri': 'otpauth://totp/example',
            },
            ('POST', final body) when body!.contains('"action":"enable"') => {
              'enabled': true,
              'recoveryCodes': ['ONE-TIME-CODE'],
              'recoveryCodesRemaining': 1,
            },
            ('POST', _) => {
              'recoveryCodes': ['NEW-ONE-TIME-CODE'],
            },
            ('DELETE', _) => {'enabled': false},
            _ => throw StateError('Unexpected request'),
          };
          return http.Response(jsonEncode(response), 200);
        },
      );
      final api = NeoLedgerApi(transport: transport);

      expect(await api.fetchMfaStatus(), {
        'enabled': false,
        'recoveryCodesRemaining': 0,
      });
      expect((await api.beginMfaSetup())['secret'], 'TEMPORARYSECRET');
      expect((await api.confirmMfaSetup(' 123456 '))['enabled'], isTrue);
      expect(
        (await api.regenerateMfaRecoveryCodes('654321'))['recoveryCodes'],
        ['NEW-ONE-TIME-CODE'],
      );
      expect((await api.disableMfa('112233'))['enabled'], isFalse);

      expect(requests.map((request) => (request.method, request.path)), [
        ('GET', '/api/auth/mfa'),
        ('POST', '/api/auth/mfa'),
        ('POST', '/api/auth/mfa'),
        ('POST', '/api/auth/mfa'),
        ('DELETE', '/api/auth/mfa'),
      ]);
      expect(requests[1].body, {'action': 'begin'});
      expect(requests[2].body, {'action': 'enable', 'code': '123456'});
      expect(requests[3].body, {
        'action': 'regenerate-recovery',
        'code': '654321',
      });
      expect(requests[4].body, {'code': '112233'});
      expect(
        persistedWrites,
        isEmpty,
        reason: 'TOTP secrets and recovery codes must never enter preferences',
      );
    },
  );
}
