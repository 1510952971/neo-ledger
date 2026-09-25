import 'dart:convert';

/// Bounded in-memory metadata only; never stores API bodies, URLs or secrets.
class MobileDiagnostics {
  MobileDiagnostics({this.capacity = 20});

  static final instance = MobileDiagnostics();

  final int capacity;
  final List<_MobileDiagnosticEvent> _events = [];

  int get length => _events.length;

  void recordApiFailure({
    required String method,
    required String path,
    required int? statusCode,
  }) {
    final normalizedMethod =
        const {
          'GET',
          'POST',
          'PUT',
          'PATCH',
          'DELETE',
        }.contains(method.toUpperCase())
        ? method.toUpperCase()
        : 'OTHER';
    final segments = Uri.tryParse(path)?.pathSegments ?? const <String>[];
    final apiIndex = segments.indexOf('api');
    final area = apiIndex >= 0 && apiIndex + 1 < segments.length
        ? _safeAreas.contains(segments[apiIndex + 1])
              ? segments[apiIndex + 1]
              : 'other'
        : 'other';
    _events.add(
      _MobileDiagnosticEvent(
        method: normalizedMethod,
        area: area,
        statusCode: statusCode != null && statusCode >= 100 && statusCode <= 599
            ? statusCode
            : null,
      ),
    );
    if (_events.length > capacity) {
      _events.removeRange(0, _events.length - capacity);
    }
  }

  String exportRedactedJson({
    required String appVersion,
    required String platform,
  }) {
    final safeVersion = RegExp(r'^[0-9A-Za-z.+-]{1,32}$').hasMatch(appVersion)
        ? appVersion
        : 'unknown';
    final safePlatform =
        const {
          'android',
          'ios',
          'linux',
          'macos',
          'windows',
          'web',
        }.contains(platform.toLowerCase())
        ? platform.toLowerCase()
        : 'other';
    return jsonEncode({
      'schemaVersion': 1,
      'appVersion': safeVersion,
      'platform': safePlatform,
      'apiFailures': _events.map((event) => event.toJson()).toList(),
    });
  }

  void clear() => _events.clear();

  static const _safeAreas = {
    'accounts',
    'assets',
    'auth',
    'categories',
    'data',
    'forecast',
    'ledgers',
    'notifications',
    'offline-sync',
    'preferences',
    'recurring-tasks',
    'savings-goals',
    'security',
    'subscriptions',
    'sync',
    'transactions',
    'transfers',
  };
}

class _MobileDiagnosticEvent {
  const _MobileDiagnosticEvent({
    required this.method,
    required this.area,
    required this.statusCode,
  });

  final String method;
  final String area;
  final int? statusCode;

  Map<String, Object?> toJson() => {
    'method': method,
    'area': area,
    if (statusCode != null) 'status': statusCode,
  };
}
