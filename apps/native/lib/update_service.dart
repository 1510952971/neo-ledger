import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

class NeoLedgerUpdateService {
  NeoLedgerUpdateService({
    http.Client? client,
    this._timeout = const Duration(seconds: 15),
  }) : _client = client ?? http.Client();

  static const repository = '1510952971/neo-ledger';
  static const _githubApiVersion = '2022-11-28';
  final http.Client _client;
  final Duration _timeout;

  Future<UpdateInfo?> checkLatest() async {
    Object? serviceError;
    try {
      final service = await _fetchServiceRelease();
      if (service != null) return service;
    } catch (error) {
      serviceError = error;
    }
    try {
      final releases = await _fetchReleases();
      return _selectRelease(
        releases,
        tagPattern: RegExp(r'^native-v\d+\.\d+\.\d+$'),
        includePrerelease: false,
      );
    } catch (error) {
      throw Exception(
        '更新检查失败：服务地址${serviceError == null ? '不可用' : '连接失败'}，GitHub 也不可用（$error）',
      );
    }
  }

  Future<UpdateInfo?> _fetchServiceRelease() async {
    final uri = Uri.parse(
      'https://ledger.eyeme.online/api/native-update?ts=${DateTime.now().millisecondsSinceEpoch}',
    );
    final response = await _client
        .get(
          uri,
          headers: const {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache, no-store',
            'Pragma': 'no-cache',
            'User-Agent': 'Neo-Ledger-Native',
          },
        )
        .timeout(_timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('服务地址更新检查失败（HTTP ${response.statusCode}）');
    }
    final decoded = jsonDecode(utf8.decode(response.bodyBytes));
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('服务地址更新响应格式无效');
    }
    if (decoded['tag'] == null) return null;
    return UpdateInfo.fromService(decoded);
  }

  /// Preview builds stay out of the stable update channel so a production
  /// client never installs an unsigned test package silently.
  Future<UpdateInfo?> checkLatestWindowsPreview() async {
    final releases = await _fetchReleases();
    return _selectRelease(
      releases,
      tagPattern: RegExp(r'^windows-preview-v\d+\.\d+\.\d+$'),
      includePrerelease: true,
    );
  }

  Future<List<Map<String, dynamic>>> _fetchReleases() async {
    final uri = Uri.parse(
      'https://api.github.com/repos/$repository/releases?per_page=100&ts=${DateTime.now().millisecondsSinceEpoch}',
    );
    final response = await _client
        .get(
          uri,
          headers: const {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': _githubApiVersion,
            'Cache-Control': 'no-cache, no-store',
            'Pragma': 'no-cache',
            'User-Agent': 'Neo-Ledger-Native',
          },
        )
        .timeout(_timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('GitHub 更新检查失败（HTTP ${response.statusCode}）');
    }
    final decoded = jsonDecode(utf8.decode(response.bodyBytes));
    if (decoded is! List) throw const FormatException('GitHub 更新响应格式无效');
    return decoded.whereType<Map<String, dynamic>>().toList();
  }

  UpdateInfo? _selectRelease(
    List<Map<String, dynamic>> releases, {
    required RegExp tagPattern,
    required bool includePrerelease,
  }) {
    final matchingReleases = releases
        .where((release) => tagPattern.hasMatch('${release['tag_name'] ?? ''}'))
        .where(
          (release) =>
              release['draft'] != true &&
              (includePrerelease || release['prerelease'] != true),
        )
        .map(UpdateInfo.fromGitHub)
        .toList();
    if (matchingReleases.isEmpty) return null;
    matchingReleases.sort((a, b) => _versionCompare(b.version, a.version));
    return matchingReleases.first;
  }

  void close() => _client.close();

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
