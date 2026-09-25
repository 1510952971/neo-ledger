import 'package:flutter_secure_storage/flutter_secure_storage.dart';

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

  static const defaultBaseUrl = 'https://ledger.eyeme.online';
  static const cookieStorageKey = 'neo_ledger_session_cookie';
  static const baseUrlStorageKey = 'neo_ledger_base_url';
  static const autoLogSecretStorageKey = 'neo_ledger_auto_log_secret';

  final MobileSessionRead read;
  final MobileSessionWrite write;
  final MobileSessionDelete delete;

  String _baseUrl = defaultBaseUrl;
  String? _cookie;
  String _autoLogSecret = '';

  String get baseUrl => _baseUrl;
  String? get cookie => _cookie;
  bool get hasSession => _cookie != null && _cookie!.isNotEmpty;
  String get autoLogSecret => _autoLogSecret;

  Future<void> load() async {
    _cookie = await read(cookieStorageKey);
    final storedBaseUrl = await read(baseUrlStorageKey);
    // v1.3.3 used localhost as the implicit value. Migrate that value so an
    // upgraded production app does not try to connect to the phone itself.
    _baseUrl =
        storedBaseUrl == null ||
            storedBaseUrl.isEmpty ||
            storedBaseUrl == 'http://localhost:3000'
        ? defaultBaseUrl
        : storedBaseUrl;
    if (storedBaseUrl != _baseUrl) {
      await write(baseUrlStorageKey, _baseUrl);
    }
    _autoLogSecret = await read(autoLogSecretStorageKey) ?? '';
  }

  Future<void> setBaseUrl(String value) async {
    final normalized = value.trim().replaceFirst(RegExp(r'/$'), '');
    if (normalized.isEmpty) return;
    _baseUrl = normalized;
    await write(baseUrlStorageKey, normalized);
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
  }

  Future<void> logout() async {
    _cookie = null;
    await delete(cookieStorageKey);
  }
}
