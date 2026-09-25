import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api_client.dart';

class MobileMfaSettingsSheet extends StatefulWidget {
  const MobileMfaSettingsSheet({super.key, required this.api});

  final NeoLedgerApi api;

  @override
  State<MobileMfaSettingsSheet> createState() => _MobileMfaSettingsSheetState();
}

class _MobileMfaSettingsSheetState extends State<MobileMfaSettingsSheet> {
  final _code = TextEditingController();
  bool _loading = true;
  bool _busy = false;
  bool _enabled = false;
  int _recoveryCodesRemaining = 0;
  String? _secret;
  String? _uri;
  String? _error;
  List<String> _recoveryCodes = const [];

  @override
  void initState() {
    super.initState();
    _loadStatus();
  }

  @override
  void dispose() {
    _code.dispose();
    _secret = null;
    _uri = null;
    _recoveryCodes = const [];
    super.dispose();
  }

  Future<void> _loadStatus() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await widget.api.fetchMfaStatus();
      if (!mounted) return;
      setState(() {
        _enabled = result['enabled'] == true;
        _recoveryCodesRemaining =
            (result['recoveryCodesRemaining'] as num?)?.toInt() ?? 0;
      });
    } catch (error) {
      if (mounted) setState(() => _error = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _beginSetup() async {
    await _run(() async {
      final result = await widget.api.beginMfaSetup();
      if (!mounted) return;
      setState(() {
        _secret = result['secret'] as String;
        _uri = result['uri'] as String?;
        _recoveryCodes = const [];
      });
    });
  }

  Future<void> _enable() async {
    await _run(() async {
      final result = await widget.api.confirmMfaSetup(_code.text);
      if (!mounted) return;
      setState(() {
        _enabled = result['enabled'] == true;
        _recoveryCodes = _readCodes(result['recoveryCodes']);
        _recoveryCodesRemaining = _recoveryCodes.length;
        _secret = null;
        _uri = null;
        _code.clear();
      });
    });
  }

  Future<void> _regenerateRecoveryCodes() async {
    await _run(() async {
      final result = await widget.api.regenerateMfaRecoveryCodes(_code.text);
      if (!mounted) return;
      setState(() {
        _recoveryCodes = _readCodes(result['recoveryCodes']);
        _recoveryCodesRemaining = _recoveryCodes.length;
        _code.clear();
      });
    });
  }

  Future<void> _disable() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('关闭二次验证？'),
        content: const Text('关闭后，账号登录将不再要求验证器动态码。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('继续关闭'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _run(() async {
      await widget.api.disableMfa(_code.text);
      if (!mounted) return;
      setState(() {
        _enabled = false;
        _recoveryCodesRemaining = 0;
        _recoveryCodes = const [];
        _secret = null;
        _uri = null;
        _code.clear();
      });
    });
  }

  List<String> _readCodes(dynamic value) => value is List
      ? value.whereType<String>().take(12).toList(growable: false)
      : const [];

  Future<void> _run(Future<void> Function() operation) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await operation();
    } catch (error) {
      if (mounted) setState(() => _error = _friendlyError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _friendlyError(Object error) =>
      error is ApiException ? error.message : '操作失败，请检查网络后重试。';

  Future<void> _copyRecoveryCodes() async {
    await Clipboard.setData(ClipboardData(text: _recoveryCodes.join('\n')));
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('恢复码已复制，请保存到安全的位置')));
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * .82,
          ),
          child: ListView(
            shrinkWrap: true,
            children: [
              Text('二次验证', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 6),
              Text(
                '使用验证器应用保护账号。设置密钥和恢复码只在此页面临时显示。',
                style: TextStyle(color: colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 14),
              if (_loading)
                const Center(child: CircularProgressIndicator())
              else ...[
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    _enabled ? Icons.verified_user : Icons.shield_outlined,
                    color: _enabled ? colorScheme.primary : null,
                  ),
                  title: Text(_enabled ? '二次验证已开启' : '二次验证未开启'),
                  subtitle: Text(
                    _enabled
                        ? '剩余恢复码：$_recoveryCodesRemaining'
                        : '使用 TOTP 验证器应用生成动态验证码',
                  ),
                ),
                if (!_enabled && _secret == null)
                  FilledButton.icon(
                    onPressed: _busy ? null : _beginSetup,
                    icon: const Icon(Icons.add_moderator_outlined),
                    label: const Text('开始设置'),
                  ),
                if (_secret case final secret?) ...[
                  const SizedBox(height: 8),
                  const Text(
                    '在验证器应用中添加账号，并手动输入以下密钥：',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  SelectableText(
                    secret,
                    style: Theme.of(context).textTheme.titleMedium
                        ?.copyWith(fontFamily: 'monospace', letterSpacing: 1.2),
                  ),
                  if (_uri != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      '也可在验证器中使用 URI：',
                      style: TextStyle(color: colorScheme.onSurfaceVariant),
                    ),
                    SelectableText(_uri!),
                  ],
                  const SizedBox(height: 12),
                  _codeField(),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: _busy || _code.text.trim().length != 6
                        ? null
                        : _enable,
                    child: const Text('验证并开启'),
                  ),
                ],
                if (_enabled) ...[
                  const SizedBox(height: 8),
                  _codeField(),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _busy || _code.text.trim().length != 6
                        ? null
                        : _regenerateRecoveryCodes,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('重新生成恢复码'),
                  ),
                  OutlinedButton.icon(
                    onPressed: _busy || _code.text.trim().length != 6
                        ? null
                        : _disable,
                    icon: const Icon(Icons.no_encryption_outlined),
                    label: const Text('关闭二次验证'),
                  ),
                ],
                if (_recoveryCodes.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Material(
                    color: colorScheme.secondaryContainer,
                    borderRadius: BorderRadius.circular(12),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text(
                            '请现在保存这些一次性恢复码',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 8),
                          SelectableText(
                            _recoveryCodes.join('\n'),
                            style: const TextStyle(fontFamily: 'monospace'),
                          ),
                          const SizedBox(height: 8),
                          OutlinedButton.icon(
                            onPressed: _copyRecoveryCodes,
                            icon: const Icon(Icons.copy_rounded),
                            label: const Text('复制恢复码'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
                if (_busy) ...[
                  const SizedBox(height: 8),
                  const LinearProgressIndicator(),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(_error!, style: TextStyle(color: colorScheme.error)),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _codeField() => TextField(
    controller: _code,
    onChanged: (_) => setState(() {}),
    keyboardType: TextInputType.number,
    textInputAction: TextInputAction.done,
    maxLength: 6,
    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
    decoration: const InputDecoration(
      labelText: '6 位动态验证码',
      counterText: '',
      prefixIcon: Icon(Icons.password_rounded),
    ),
  );
}
