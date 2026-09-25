import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:neo_ledger/api_client.dart';
import 'package:neo_ledger/features/profile/mobile_mfa_settings_sheet.dart';
import 'package:neo_ledger/mobile/data/mobile_api_session_store.dart';
import 'package:neo_ledger/mobile/data/mobile_api_transport.dart';

void main() {
  testWidgets('setup confirms TOTP and displays one-time recovery codes', (
    tester,
  ) async {
    var enabled = false;
    final values = <String, String>{
      MobileApiSessionStore.baseUrlStorageKey: 'https://ledger.example',
      MobileApiSessionStore.cookieStorageKey: 'neo_ledger_session=session',
    };
    final session = MobileApiSessionStore(
      read: (key) async => values[key],
      write: (key, value) async => values[key] = value,
      delete: (key) async => values.remove(key),
    );
    await session.load();
    final api = NeoLedgerApi(
      transport: MobileApiTransport(
        session: session,
        request: (method, uri, _, rawBody) async {
          final body = rawBody == null
              ? const <String, dynamic>{}
              : jsonDecode(rawBody) as Map<String, dynamic>;
          final result = switch ((method, body['action'])) {
            ('GET', _) => {
              'enabled': enabled,
              'recoveryCodesRemaining': enabled ? 8 : 0,
            },
            ('POST', 'begin') => {
              'secret': 'TEMPORARY-SETUP-KEY',
              'uri': 'otpauth://totp/NeoLedger',
            },
            ('POST', 'enable') => () {
              enabled = true;
              return {
                'enabled': true,
                'recoveryCodes': ['ONE-TIME-A', 'ONE-TIME-B'],
              };
            }(),
            _ => throw StateError('Unexpected MFA request: $method $body'),
          };
          return http.Response(jsonEncode(result), 200);
        },
      ),
    );

    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(
          size: Size(320, 560),
          textScaler: TextScaler.linear(1.8),
        ),
        child: MaterialApp(
          home: Scaffold(body: MobileMfaSettingsSheet(api: api)),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('二次验证未开启'), findsOneWidget);

    await tester.tap(find.text('开始设置'));
    await tester.pumpAndSettle();
    expect(find.text('TEMPORARY-SETUP-KEY'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.enterText(find.byType(TextField), '123456');
    await tester.scrollUntilVisible(
      find.text('验证并开启'),
      360,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('验证并开启'));
    await tester.pumpAndSettle();

    expect(find.text('二次验证已开启'), findsOneWidget);
    expect(find.textContaining('ONE-TIME-A'), findsOneWidget);
    expect(find.textContaining('ONE-TIME-B'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
