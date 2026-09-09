import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:url_launcher/url_launcher.dart';

import 'app.dart';
import 'update_service.dart';
import 'windows_update_service.dart';

const unifiedAppUrl = 'https://neo-ledger-production.neo-ledger.workers.dev';

class UnifiedWebShell extends StatefulWidget {
  const UnifiedWebShell({
    super.key,
    required this.controller,
    required this.nativeVersion,
  });

  final LedgerController controller;
  final String nativeVersion;

  @override
  State<UnifiedWebShell> createState() => _UnifiedWebShellState();
}

class _UnifiedWebShellState extends State<UnifiedWebShell> {
  static const _companionChannel = MethodChannel(
    'online.eyeme.neo_ledger/companion',
  );
  final _updateService = NeoLedgerUpdateService();
  InAppWebViewController? _webController;
  String? _loadError;
  double _progress = 0;
  bool _checkedUpdate = false;

  @override
  void dispose() {
    _updateService.close();
    super.dispose();
  }

  String get _platformName => switch (defaultTargetPlatform) {
    TargetPlatform.android => 'android',
    TargetPlatform.iOS => 'ios',
    TargetPlatform.windows => 'windows',
    TargetPlatform.macOS => 'macos',
    _ => 'other',
  };

  Future<void> _checkForUpdate() async {
    if (_checkedUpdate) return;
    _checkedUpdate = true;
    try {
      final latest = await _updateService.checkLatest();
      if (!mounted ||
          latest == null ||
          !latest.isNewerThan(widget.nativeVersion)) {
        return;
      }
      final platform = _platformName;
      final asset = latest.assetFor(platform);
      final assetName = latest.assetNameFor(platform);
      if (asset == null || assetName == null) return;
      final install = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('发现新版本 v${latest.version}'),
          content: const Text('是否下载并安装最新统一客户端？'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('稍后'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('更新'),
            ),
          ],
        ),
      );
      if (install != true || !mounted) return;
      if (platform == 'android' && assetName.toLowerCase().endsWith('.apk')) {
        await widget.controller.installAndroidUpdate(
          version: latest.version,
          apkUrl: asset,
          apkName: assetName,
          checksumUrl: latest.checksumManifestUrl,
        );
        return;
      }
      if (platform == 'windows' &&
          assetName.toLowerCase().endsWith('.exe') &&
          latest.checksumManifestUrl != null) {
        await downloadAndInstallWindowsUpdate(
          url: asset,
          fileName: assetName,
          checksumUrl: latest.checksumManifestUrl!,
        );
        return;
      }
      final uri = Uri.tryParse(asset);
      if (uri != null) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (_) {
      // Update checks must never prevent the shared web application loading.
    }
  }

  Future<void> _retry() async {
    setState(() => _loadError = null);
    await _webController?.loadUrl(
      urlRequest: URLRequest(url: WebUri(unifiedAppUrl)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        if (await _webController?.canGoBack() ?? false) {
          await _webController?.goBack();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xff101116),
        body: SafeArea(
          top:
              defaultTargetPlatform == TargetPlatform.android ||
              defaultTargetPlatform == TargetPlatform.iOS,
          bottom: false,
          child: Stack(
            children: [
              InAppWebView(
                initialUrlRequest: URLRequest(url: WebUri(unifiedAppUrl)),
                initialSettings: InAppWebViewSettings(
                  javaScriptEnabled: true,
                  domStorageEnabled: true,
                  databaseEnabled: true,
                  useShouldOverrideUrlLoading: true,
                  allowsBackForwardNavigationGestures: true,
                  mediaPlaybackRequiresUserGesture: false,
                  transparentBackground: false,
                  supportZoom: false,
                  userAgent: 'Neo-Ledger-Native/${widget.nativeVersion}',
                ),
                onWebViewCreated: (controller) {
                  _webController = controller;
                  controller.addJavaScriptHandler(
                    handlerName: 'neoLedgerNative',
                    callback: (arguments) async {
                      if (defaultTargetPlatform != TargetPlatform.android ||
                          arguments.isEmpty ||
                          arguments.first is! Map) {
                        return {'ok': false, 'available': false};
                      }
                      final message = Map<String, dynamic>.from(
                        arguments.first as Map,
                      );
                      if (message['action'] != 'configureAndroid') {
                        return {'ok': false, 'available': true};
                      }
                      final config = Map<String, dynamic>.from(
                        message['config'] as Map? ?? const {},
                      );
                      await _companionChannel.invokeMethod<void>('configure', {
                        'endpoint': '${config['url'] ?? unifiedAppUrl}',
                        'secret': '${config['token'] ?? ''}',
                        'ledgerId': config['ledgerId'],
                        'wechat': true,
                        'alipay': true,
                        'marketApps': true,
                        'extraPackages': '',
                      });
                      await _companionChannel.invokeMethod<void>(
                        'openLegacyCompanion',
                      );
                      return {'ok': true, 'available': true};
                    },
                  );
                },
                onProgressChanged: (_, progress) {
                  if (mounted) setState(() => _progress = progress / 100);
                },
                onLoadStart: (_, url) {
                  if (mounted) setState(() => _loadError = null);
                },
                onLoadStop: (_, url) {
                  if (mounted) setState(() => _progress = 1);
                  unawaited(_checkForUpdate());
                },
                onReceivedError: (_, request, error) {
                  if (request.isForMainFrame != true || !mounted) return;
                  setState(() => _loadError = error.description);
                },
                shouldOverrideUrlLoading: (_, action) async {
                  final uri = action.request.url;
                  if (uri == null) return NavigationActionPolicy.CANCEL;
                  if (uri.scheme == 'http' || uri.scheme == 'https') {
                    return NavigationActionPolicy.ALLOW;
                  }
                  await launchUrl(
                    Uri.parse(uri.toString()),
                    mode: LaunchMode.externalApplication,
                  );
                  return NavigationActionPolicy.CANCEL;
                },
              ),
              if (_progress < 1 && _loadError == null)
                Align(
                  alignment: Alignment.topCenter,
                  child: LinearProgressIndicator(
                    value: _progress == 0 ? null : _progress,
                    minHeight: 2,
                    color: const Color(0xffa5ff4f),
                    backgroundColor: Colors.transparent,
                  ),
                ),
              if (_loadError != null)
                ColoredBox(
                  color: const Color(0xff101116),
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(28),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.cloud_off_outlined,
                            size: 42,
                            color: Color(0xffa5ff4f),
                          ),
                          const SizedBox(height: 16),
                          const Text(
                            '暂时无法连接统一服务器',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _loadError!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.white60),
                          ),
                          const SizedBox(height: 18),
                          FilledButton.icon(
                            onPressed: _retry,
                            icon: const Icon(Icons.refresh),
                            label: const Text('重试'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
