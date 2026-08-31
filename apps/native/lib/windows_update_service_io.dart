import 'dart:io';

import 'package:http/http.dart' as http;

import 'windows_platform.dart';

Future<void> downloadAndInstallWindowsUpdate({
  required String url,
  required String fileName,
}) async {
  if (!NeoWindowsPlatform.supported) {
    throw UnsupportedError('Windows 更新只能在 Windows 客户端执行');
  }
  final uri = Uri.tryParse(url);
  if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
    throw const FormatException('更新地址不是安全的 HTTPS 地址');
  }

  final normalizedName = fileName
      .replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_')
      .trim();
  if (!normalizedName.toLowerCase().startsWith('neo-ledger-windows-') ||
      !normalizedName.toLowerCase().endsWith('.exe')) {
    throw const FormatException('更新文件不是 Neo Ledger Windows 安装器');
  }

  final response = await http.get(uri).timeout(const Duration(minutes: 2));
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw HttpException('更新下载失败（HTTP ${response.statusCode}）', uri: uri);
  }
  if (response.bodyBytes.isEmpty) {
    throw const FormatException('更新文件为空');
  }

  final installer = File(
    '${Directory.systemTemp.path}${Platform.pathSeparator}$normalizedName',
  );
  await installer.writeAsBytes(response.bodyBytes, flush: true);
  await NeoWindowsPlatform.installWindowsUpdate(installerPath: installer.path);
}
