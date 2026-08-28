import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

class NeoLedgerUpdateService {
  NeoLedgerUpdateService({http.Client? client})
    : _client = client ?? http.Client();

  static const repository = '1510952971/neo-ledger';
  final http.Client _client;

  Future<UpdateInfo?> checkLatest() async {
    final uri = Uri.parse(
      'https://api.github.com/repos/$repository/releases?per_page=30',
    );
    final response = await _client.get(
      uri,
      headers: const {'Accept': 'application/vnd.github+json'},
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('GitHub 更新检查失败（HTTP ${response.statusCode}）');
    }
    final decoded = jsonDecode(utf8.decode(response.bodyBytes));
    if (decoded is! List) throw const FormatException('GitHub 更新响应格式无效');
    final releases = decoded
        .whereType<Map<String, dynamic>>()
        .where(
          (release) => '${release['tag_name'] ?? ''}'.startsWith('native-v'),
        )
        .where(
          (release) =>
              release['draft'] != true && release['prerelease'] != true,
        )
        .map(UpdateInfo.fromGitHub)
        .toList();
    if (releases.isEmpty) return null;
    releases.sort((a, b) => _versionCompare(b.version, a.version));
    return releases.first;
  }

  static int _versionCompare(String left, String right) {
    List<int> parse(String value) => value
        .split(RegExp(r'[+\-]'))
        .first
        .split('.')
        .map((part) => int.tryParse(part) ?? 0)
        .toList();
    final a = parse(left);
    final b = parse(right);
    for (var i = 0; i < 3; i++) {
      final result = (a.length > i ? a[i] : 0).compareTo(
        b.length > i ? b[i] : 0,
      );
      if (result != 0) return result;
    }
    return 0;
  }
}
