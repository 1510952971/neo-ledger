import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:neo_ledger/mobile/data/mobile_api_session_store.dart';
import 'package:neo_ledger/mobile/data/mobile_api_transport.dart';
import 'package:neo_ledger/mobile/data/mobile_idempotency_key_store.dart';
import 'package:neo_ledger/mobile/domain/mobile_api_exception.dart';
import 'package:neo_ledger/mobile/domain/mobile_diagnostics.dart';

Future<MobileApiSessionStore> makeSession() async {
  final values = <String, String>{
    MobileApiSessionStore.baseUrlStorageKey: 'https://ledger.example/',
    MobileApiSessionStore.cookieStorageKey: 'neo_ledger_session=secret',
  };
  final session = MobileApiSessionStore(
    read: (key) async => values[key],
    write: (key, value) async => values[key] = value,
    delete: (key) async => values.remove(key),
  );
  await session.load();
  return session;
}

void main() {
  test('encodes JSON and applies the shared session cookie', () async {
    final session = await makeSession();
    late Uri requestedUri;
    late Map<String, String> requestedHeaders;
    late String requestedBody;
    final transport = MobileApiTransport(
      session: session,
      request: (method, uri, headers, body) async {
        expect(method, 'POST');
        requestedUri = uri;
        requestedHeaders = headers;
        requestedBody = body!;
        return http.Response('{"ok":true}', 200);
      },
    );

    final response = await transport.send(
      'POST',
      '/api/transactions',
      body: {'amount': 12.5},
    );

    expect(requestedUri.toString(), 'https://ledger.example/api/transactions');
    expect(requestedHeaders['Cookie'], 'neo_ledger_session=secret');
    expect(requestedHeaders['Content-Type'], 'application/json');
    expect(jsonDecode(requestedBody), {'amount': 12.5});
    expect(transport.decodeObject(response), {'ok': true});
  });

  test('supports unauthenticated requests and explicit headers', () async {
    final session = await makeSession();
    late Map<String, String> requestedHeaders;
    final transport = MobileApiTransport(
      session: session,
      request: (method, uri, headers, body) async {
        requestedHeaders = headers;
        return http.Response('{"token":"one-time"}', 200);
      },
    );

    final response = await transport.send(
      'POST',
      '/api/auth',
      body: {'action': 'login'},
      includeCookie: false,
      extraHeaders: {'x-request-id': 'test-request'},
    );

    expect(requestedHeaders.containsKey('Cookie'), isFalse);
    expect(requestedHeaders['x-request-id'], 'test-request');
    expect(transport.decodeAny(response), {'token': 'one-time'});
  });

  test('maps server and network failures to safe API exceptions', () async {
    MobileDiagnostics.instance.clear();
    addTearDown(MobileDiagnostics.instance.clear);
    final session = await makeSession();
    final serverFailure = MobileApiTransport(
      session: session,
      request: (method, uri, headers, body) async => http.Response(
        '{"error":"版本冲突"}',
        409,
        headers: {'content-type': 'application/json; charset=utf-8'},
      ),
    );
    await expectLater(
      serverFailure.send('DELETE', '/api/transactions'),
      throwsA(
        isA<ApiException>()
            .having((error) => error.statusCode, 'statusCode', 409)
            .having((error) => error.message, 'message', '版本冲突'),
      ),
    );

    final networkFailure = MobileApiTransport(
      session: session,
      request: (method, uri, headers, body) async =>
          throw StateError('offline'),
    );
    await expectLater(
      networkFailure.send('GET', '/api/transactions'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          contains('无法连接 https://ledger.example'),
        ),
      ),
    );
    final report = MobileDiagnostics.instance.exportRedactedJson(
      appVersion: '1.4.0',
      platform: 'android',
    );
    final failures =
        (jsonDecode(report) as Map<String, dynamic>)['apiFailures'] as List;
    expect(failures, [
      {'method': 'DELETE', 'area': 'transactions', 'status': 409},
      {'method': 'GET', 'area': 'transactions'},
    ]);
    expect(report, isNot(contains('版本冲突')));
    expect(report, isNot(contains('ledger.example')));
    expect(report, isNot(contains('neo_ledger_session')));
  });

  test(
    'reuses a secure idempotency key when a write times out and is retried',
    () async {
      final session = await makeSession();
      final saved = <String, String>{};
      final keys = MobileIdempotencyKeyStore(
        read: (key) async => saved[key],
        write: (key, value) async => saved[key] = value,
        delete: (key) async => saved.remove(key),
      );
      final observedKeys = <String>[];
      var attempts = 0;
      final transport = MobileApiTransport(
        session: session,
        idempotencyKeys: keys,
        request: (method, uri, headers, body) async {
          attempts++;
          observedKeys.add(headers['Idempotency-Key']!);
          if (attempts == 1) throw StateError('connection reset after send');
          return http.Response('{"ok":true}', 200);
        },
      );

      await expectLater(
        transport.send('POST', '/api/accounts', body: {'name': '现金账户'}),
        throwsA(isA<ApiException>()),
      );
      await transport.send('POST', '/api/accounts', body: {'name': '现金账户'});

      expect(observedKeys, hasLength(2));
      expect(observedKeys.first, startsWith('native-http-post-'));
      expect(observedKeys[1], observedKeys.first);
      expect(saved, isEmpty);
    },
  );

  test('rejects malformed JSON and non-object map responses clearly', () async {
    final session = await makeSession();
    final transport = MobileApiTransport(session: session);

    expect(
      () => transport.decodeAny(http.Response('not-json', 200)),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          '服务器返回了无法解析的数据',
        ),
      ),
    );
    expect(
      () => transport.decodeObject(http.Response('[]', 200)),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          '服务器响应格式无效',
        ),
      ),
    );
  });
}
