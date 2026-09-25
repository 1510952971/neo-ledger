import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

typedef MobileIdempotencyRead = Future<String?> Function(String key);
typedef MobileIdempotencyWrite = Future<void> Function(
  String key,
  String value,
);
typedef MobileIdempotencyDelete = Future<void> Function(String key);

/// Keeps the same idempotency key for the same logical request until the
/// server confirms success. Only a SHA-256 fingerprint and random key are
/// persisted; request contents are never written to local storage.
class MobileIdempotencyKeyStore {
  MobileIdempotencyKeyStore({
    required this.read,
    required this.write,
    required this.delete,
  });

  factory MobileIdempotencyKeyStore.secure(FlutterSecureStorage storage) {
    return MobileIdempotencyKeyStore(
      read: (key) => storage.read(key: key),
      write: (key, value) => storage.write(key: key, value: value),
      delete: (key) => storage.delete(key: key),
    );
  }

  static const _storagePrefix = 'neo_ledger_idempotency_v1_';

  final MobileIdempotencyRead read;
  final MobileIdempotencyWrite write;
  final MobileIdempotencyDelete delete;
  final Map<String, Future<String>> _pendingKeys = {};

  Future<T> run<T>({
    required String operation,
    required Object request,
    required Future<T> Function(String idempotencyKey) send,
    String? idempotencyKey,
  }) async {
    final storageKey = _storageKey(operation, request);
    final key = idempotencyKey ?? await _getOrCreate(storageKey, operation);
    final result = await send(key);
    if (idempotencyKey == null) {
      // The remote write succeeded. A local secure-storage cleanup failure
      // must not turn a committed server operation into a reported failure.
      try {
        await delete(storageKey);
      } catch (_) {}
    }
    return result;
  }

  Future<String> _getOrCreate(String storageKey, String operation) async {
    final pending = _pendingKeys[storageKey];
    if (pending != null) return pending;
    final created = _readOrCreate(storageKey, operation);
    _pendingKeys[storageKey] = created;
    try {
      return await created;
    } finally {
      if (identical(_pendingKeys[storageKey], created)) {
        _pendingKeys.remove(storageKey);
      }
    }
  }

  Future<String> _readOrCreate(String storageKey, String operation) async {
    final existing = await read(storageKey);
    if (existing != null && existing.isNotEmpty) return existing;
    final key = '$operation-${_randomToken()}';
    await write(storageKey, key);
    return key;
  }

  String _storageKey(String operation, Object request) {
    final normalized = jsonEncode(_canonicalize(request));
    final digest = sha256.convert(utf8.encode('$operation\n$normalized'));
    return '$_storagePrefix$digest';
  }

  Object? _canonicalize(Object? value) {
    if (value is Map) {
      final keys = value.keys.map((key) => '$key').toList()..sort();
      return <String, Object?>{
        for (final key in keys) key: _canonicalize(value[key]),
      };
    }
    if (value is Iterable) return value.map(_canonicalize).toList();
    return value;
  }

  String _randomToken() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes
        .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
        .join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }
}
