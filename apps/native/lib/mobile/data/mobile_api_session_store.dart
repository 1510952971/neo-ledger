import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'neo_ledger_endpoints.dart';

typedef MobileSessionRead = Future<String?> Function(String key);
typedef MobileSessionWrite = Future<void> Function(String key, String value);
typedef MobileSessionDelete = Future<void> Function(String key);

/// Isolates session credentials and server preferences from HTTP request code.
/// The established secure-storage keys are intentionally kept for upgrades.
class MobileApiSessionStore {
  MobileApiSessionStore({
    required this.read,
    required this.write,
    required this.delete,
  });

  factory MobileApiSessionStore.secure(FlutterSecureStorage storage) {
    return MobileApiSessionStore(
      read: (key) => storage.read(key: key),
      write: (key, value) => storage.write(key: key, value: value),
      delete: (key) => storage.delete(key: key),
    );
  }

  static const defaultBaseUrl = NeoLedgerEndpoints.defaultBaseUrl;
  static const cookieStorageKey = 'neo_ledger_session_cookie';
  static const cookieOriginStorageKey = 'neo_ledger_session_cookie_origin';
  static const baseUrlStorageKey = 'neo_ledger_base_url';
  static const autoLogSecretStorageKey = 'neo_ledger_auto_log_secret';

  final MobileSessionRead read;
  final MobileSessionWrite write;
  final MobileSessionDelete delete;

  String _baseUrl = defaultBaseUrl;
  String? _cookie;
  String _autoLogSecret = '';

  String get baseUrl => _baseUrl;
  String get origin => _originOf(_baseUrl);
  String? get cookie => _cookie;
  bool get hasSession => _cookie != null && _cookie!.isNotEmpty;
  String get autoLogSecret => _autoLogSecret;

  Future<void> load() async {
    _cookie = await read(cookieStorageKey);
    final storedBaseUrl = await read(baseUrlStorageKey);
    // v1.3.3 used localhost as the implicit value. Migrate that value so an
    // upgraded production app does not try to connect to the phone itself.
    final shouldUseDefault =
        storedBaseUrl == null ||
        storedBaseUrl.isEmpty ||
        storedBaseUrl == 'http://localhost:3000' ||
        storedBaseUrl == NeoLedgerEndpoints.legacyBaseUrl;
    try {
      _baseUrl = _normalizeBaseUrl(shouldUseDefault ? defaultBaseUrl : storedBaseUrl);
    } on FormatException {
      _baseUrl = defaultBaseUrl;
    }
    final cookieOrigin = await read(cookieOriginStorageKey);
    // Old cookies had no server binding. Fail closed instead of sending them
    // to a possibly different endpoint after an upgrade.
    if (_cookie != null &&
        (cookieOrigin == null || cookieOrigin != _originOf(_baseUrl))) {
      await logout();
    }
    if (storedBaseUrl != _baseUrl) {
      await write(baseUrlStorageKey, _baseUrl);
    }
    _autoLogSecret = await read(autoLogSecretStorageKey) ?? '';
  }

  Future<void> setBaseUrl(String value) async {
    final normalized = _normalizeBaseUrl(value);
    if (normalized.isEmpty) return;
    if (_originOf(normalized) != _originOf(_baseUrl)) await logout();
    _baseUrl = normalized;
    await write(baseUrlStorageKey, normalized);
  }

  static String _normalizeBaseUrl(String value) {
    final trimmed = value.trim().replaceFirst(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(trimmed);
    if (uri == null || !uri.hasAuthority || uri.host.isEmpty ||
        uri.userInfo.isNotEmpty || uri.query.isNotEmpty || uri.fragment.isNotEmpty) {
      throw const FormatException('服务器地址无效');
    }
    final isLoopback = const {'localhost', '127.0.0.1', '::1'}
        .contains(uri.host.toLowerCase());
    if (uri.scheme != 'https' && !(uri.scheme == 'http' && isLoopback)) {
      throw const FormatException('服务器必须使用 HTTPS（本机调试可用 HTTP）');
    }
    return uri
        .replace(path: uri.path.replaceFirst(RegExp(r'/+$'), ''))
        .toString()
        .replaceFirst(RegExp(r'/+$'), '');
  }

  static String _originOf(String value) {
    final uri = Uri.parse(value);
    return '${uri.scheme.toLowerCase()}://${uri.host.toLowerCase()}:${uri.hasPort ? uri.port : (uri.scheme == 'https' ? 443 : 80)}';
  }

  /// Separate bearer secret for automatic-ledger integrations. It must never
  /// be substituted for the user's normal login cookie.
  Future<void> setAutoLogSecret(String value) async {
    _autoLogSecret = value.trim();
    if (_autoLogSecret.isEmpty) {
      await delete(autoLogSecretStorageKey);
    } else {
      await write(autoLogSecretStorageKey, _autoLogSecret);
    }
  }

  Future<void> captureSetCookieHeader(String? header) async {
    if (header == null) return;
    final match = RegExp(r'(neo_ledger_session=[^;]+)').firstMatch(header);
    if (match == null) return;
    _cookie = match.group(1);
    await write(cookieStorageKey, _cookie!);
    await write(cookieOriginStorageKey, _originOf(_baseUrl));
  }

  Future<void> logout() async {
    _cookie = null;
    await delete(cookieStorageKey);
    await delete(cookieOriginStorageKey);
  }
}
