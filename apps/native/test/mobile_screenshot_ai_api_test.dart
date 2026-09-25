import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:neo_ledger/api_client.dart';
import 'package:neo_ledger/mobile/data/mobile_api_session_store.dart';
import 'package:neo_ledger/mobile/data/mobile_api_transport.dart';

void main() {
  test(
    'explicit AI request contains only OCR text and per-call consent',
    () async {
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
      late Uri uri;
      late Map<String, String> headers;
      late Map<String, dynamic> body;
      final transport = MobileApiTransport(
        session: session,
        request: (method, requestedUri, requestedHeaders, rawBody) async {
          expect(method, 'POST');
          uri = requestedUri;
          headers = requestedHeaders;
          body = jsonDecode(rawBody!) as Map<String, dynamic>;
          return http.Response(
            '{"suggestions":{"amount":18.8,"type":"支出"}}',
            200,
            headers: const {'content-type': 'application/json; charset=utf-8'},
          );
        },
      );
      final api = NeoLedgerApi(transport: transport);

      final result = await api.recognizeScreenshotTextWithAi(
        '金额 ¥18.80 [手机号已隐藏]',
      );

      expect(uri.path, '/api/v1/ai/screenshot-recognition');
      expect(headers['x-neo-ai-consent'], 'true');
      expect(headers['Cookie'], 'neo_ledger_session=session');
      expect(body.keys.toSet(), {'consent', 'text'});
      expect(body['text'], '金额 ¥18.80 [手机号已隐藏]');
      expect(result, {'amount': 18.8, 'type': '支出'});
    },
  );
}
