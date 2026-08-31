import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class NeoWindowsPlatform {
  NeoWindowsPlatform._();

  static const _channel = MethodChannel('neo_ledger/platform');

  static bool get supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.windows;

  static Future<String?> getDataDirectory() async {
    if (!supported) return null;
    return _channel.invokeMethod<String>('getDataDirectory');
  }

  static Future<void> openDataDirectory() async {
    if (!supported) return;
    await _channel.invokeMethod<void>('openDataDirectory');
  }

  static Future<void> installWindowsUpdate({
    required String installerPath,
  }) async {
    if (!supported) {
      throw UnsupportedError('Windows 更新只能在 Windows 客户端执行');
    }
    await _channel.invokeMethod<void>('installWindowsUpdate', <String, dynamic>{
      'installerPath': installerPath,
    });
  }

  static Future<void> setFilesDroppedHandler(
    Future<void> Function(List<String>) handler,
  ) async {
    if (!supported) return;
    _channel.setMethodCallHandler((call) async {
      if (call.method != 'filesDropped') return;
      final raw = call.arguments;
      final paths = raw is List
          ? raw
                .whereType<String>()
                .where((path) => path.trim().isNotEmpty)
                .toList()
          : const <String>[];
      await handler(paths);
    });
  }

  static Future<void> clearFilesDroppedHandler() async {
    if (!supported) return;
    _channel.setMethodCallHandler(null);
  }
}
