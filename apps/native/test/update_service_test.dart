import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:neo_ledger/update_service.dart';

class _FakeClient extends http.BaseClient {
  _FakeClient(this.body, {this.statusCode = 200});

  final Object body;
  final int statusCode;
  Uri? requestedUri;
  Map<String, String>? requestedHeaders;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    requestedUri = request.url;
    requestedHeaders = request.headers;
    final bytes = utf8.encode(jsonEncode(body));
    return http.StreamedResponse(
      Stream<List<int>>.value(bytes),
      statusCode,
      headers: const {'content-type': 'application/json'},
    );
  }
}

void main() {
  test('selects the highest stable native release and bypasses caches', () async {
    final client = _FakeClient([
      {
        'tag_name': 'v9.9.9',
        'draft': false,
        'prerelease': false,
      },
      {
        'tag_name': 'native-v1.4.0',
        'draft': true,
        'prerelease': false,
      },
      {
        'tag_name': 'native-v1.3.0-beta.1',
        'draft': false,
        'prerelease': true,
      },
      {
        'tag_name': 'native-v9.9.9-beta',
        'draft': false,
        'prerelease': false,
      },
      {
        'tag_name': 'native-v1.2.0',
        'draft': false,
        'prerelease': false,
        'html_url': 'https://example.com/native-v1.2.0',
        'assets': [
          {
            'name': 'neo-ledger-android-1.2.0.apk',
            'browser_download_url': 'https://example.com/app.apk',
          },
        ],
      },
      {
        'tag_name': 'native-not-a-version',
        'draft': false,
        'prerelease': false,
      },
    ]);

    final service = NeoLedgerUpdateService(client: client);
    addTearDown(service.close);

    final update = await service.checkLatest();

    expect(update?.version, '1.2.0');
    expect(client.requestedUri?.queryParameters['ts'], isNotEmpty);
    expect(client.requestedUri?.queryParameters['per_page'], '100');
    expect(client.requestedHeaders?['cache-control'], 'no-cache, no-store');
    expect(client.requestedHeaders?['pragma'], 'no-cache');
    expect(client.requestedHeaders?['x-github-api-version'], '2022-11-28');
    expect(client.requestedHeaders?['user-agent'], 'Neo-Ledger-Native');
  });

  test('returns null when no stable native release exists', () async {
    final service = NeoLedgerUpdateService(
      client: _FakeClient([
        {'tag_name': 'v1.2.0'},
        {'tag_name': 'native-v1.3.0', 'prerelease': true},
      ]),
    );
    addTearDown(service.close);

    expect(await service.checkLatest(), isNull);
  });

  test('surfaces GitHub HTTP errors', () async {
    final service = NeoLedgerUpdateService(
      client: _FakeClient({'message': 'rate limited'}, statusCode: 403),
    );
    addTearDown(service.close);

    expect(
      service.checkLatest(),
      throwsA(
        predicate<Object>(
          (error) => '$error'.contains('GitHub 更新检查失败（HTTP 403）'),
        ),
      ),
    );
  });
}
