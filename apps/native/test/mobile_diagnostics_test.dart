import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/domain/mobile_diagnostics.dart';

void main() {
  test('diagnostic export excludes URL, query, request, and response data', () {
    final diagnostics = MobileDiagnostics();
    diagnostics.recordApiFailure(
      method: 'post',
      path: '/api/transactions/secret-ledger-id?token=secret-token',
      statusCode: 503,
    );

    final report = diagnostics.exportRedactedJson(
      appVersion: '1.4.0',
      platform: 'iOS',
    );
    final decoded = jsonDecode(report) as Map<String, dynamic>;
    final event = (decoded['apiFailures'] as List).single;

    expect(decoded['platform'], 'ios');
    expect(event, {'method': 'POST', 'area': 'transactions', 'status': 503});
    expect(report, isNot(contains('secret-ledger-id')));
    expect(report, isNot(contains('secret-token')));
    expect(report, isNot(contains('https://')));
  });

  test('diagnostics stay bounded and can be cleared in memory', () {
    final diagnostics = MobileDiagnostics(capacity: 2);
    for (var i = 0; i < 3; i++) {
      diagnostics.recordApiFailure(
        method: 'GET',
        path: '/api/transactions/$i',
        statusCode: 500 + i,
      );
    }

    expect(diagnostics.length, 2);
    diagnostics.clear();
    expect(diagnostics.length, 0);
  });
}
