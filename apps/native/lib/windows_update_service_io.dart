import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'update_integrity.dart';
import 'windows_platform.dart';

const _maxWindowsInstallerBytes = 150 * 1024 * 1024;
const _maxChecksumManifestBytes = 64 * 1024;

bool _isTrustedGitHubUrl(Uri uri) {
  final host = uri.host.toLowerCase();
  return uri.scheme == 'https' &&
      (host == 'github.com' || host == 'objects.githubusercontent.com');
}

Future<http.Response> _getUpdateResource(Uri uri) {
  return http
      .get(
        uri,
        headers: const {
          'accept': '*/*',
          'cache-control': 'no-cache, no-store',
          'pragma': 'no-cache',
          'user-agent': 'Neo-Ledger-Native',
        },
      )
      .timeout(const Duration(minutes: 2));
}

Future<void> downloadAndInstallWindowsUpdate({
  required String url,
  required String fileName,
  required String checksumUrl,
}) async {
  if (!NeoWindowsPlatform.supported) {
    throw UnsupportedError('Windows 更新只能在 Windows 客户端执行');
  }
  final uri = Uri.tryParse(url);
  if (uri == null || !_isTrustedGitHubUrl(uri)) {
    throw const FormatException('更新地址不是可信的 GitHub HTTPS 地址');
  }
  final checksumUri = Uri.tryParse(checksumUrl);
  if (checksumUri == null || !_isTrustedGitHubUrl(checksumUri)) {
    throw const FormatException('Windows 更新缺少可信的 GitHub SHA-256 校验清单');
  }

  final normalizedName = fileName
      .replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_')
      .trim();
  if (!normalizedName.toLowerCase().startsWith('neo-ledger-windows-') ||
      !normalizedName.toLowerCase().endsWith('.exe')) {
    throw const FormatException('更新文件不是 Neo Ledger Windows 安装器');
  }

  final checksumResponse = await _getUpdateResource(checksumUri);
  if (checksumResponse.statusCode < 200 ||
      checksumResponse.statusCode >= 300) {
    throw HttpException(
      '更新校验清单下载失败（HTTP ${checksumResponse.statusCode}）',
      uri: checksumUri,
    );
  }
  if (checksumResponse.bodyBytes.isEmpty ||
      checksumResponse.bodyBytes.length > _maxChecksumManifestBytes) {
    throw const FormatException('更新校验清单无效或过大');
  }
  final manifest = utf8.decode(
    checksumResponse.bodyBytes,
    allowMalformed: false,
  );
  final expectedSha256 = findExpectedSha256(manifest, normalizedName);
  if (expectedSha256 == null) {
    throw const FormatException('更新校验清单中没有对应的 Windows 安装器');
  }

  final response = await _getUpdateResource(uri);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw HttpException('更新下载失败（HTTP ${response.statusCode}）', uri: uri);
  }
  if (response.bodyBytes.isEmpty ||
      response.bodyBytes.length > _maxWindowsInstallerBytes) {
    throw const FormatException('更新文件为空');
  }
  if (!verifySha256(bytes: response.bodyBytes, expected: expectedSha256)) {
    throw const FormatException('Windows 更新校验失败，已阻止安装');
  }

  final installer = File(
    '${Directory.systemTemp.path}${Platform.pathSeparator}$normalizedName',
  );
  final partialInstaller = File('${installer.path}.part');
  await partialInstaller.writeAsBytes(response.bodyBytes, flush: true);
  await partialInstaller.rename(installer.path);
  await NeoWindowsPlatform.installWindowsUpdate(installerPath: installer.path);
}
