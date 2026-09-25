import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../mobile/domain/mobile_diagnostics.dart';

class MobileDiagnosticsSheet extends StatelessWidget {
  const MobileDiagnosticsSheet({
    required this.appVersion,
    required this.platform,
    super.key,
  });

  final String appVersion;
  final String platform;

  @override
  Widget build(BuildContext context) {
    final diagnostics = MobileDiagnostics.instance;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('隐私诊断', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 10),
            const Text(
              '诊断记录只保存在本次运行内存中，最多保留 20 条 API 失败摘要。复制内容仅包含应用版本、平台、接口类别、请求方法和 HTTP 状态码；不含账单、账号、网址、请求内容或令牌。复制后由你检查并自行决定是否发送。',
            ),
            const SizedBox(height: 10),
            Text('当前暂存 ${diagnostics.length} 条 API 摘要'),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: () async {
                await Clipboard.setData(
                  ClipboardData(
                    text: diagnostics.exportRedactedJson(
                      appVersion: appVersion,
                      platform: platform,
                    ),
                  ),
                );
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('脱敏诊断摘要已复制，可检查后自行发送')),
                  );
                }
              },
              icon: const Icon(Icons.copy_outlined),
              label: const Text('复制脱敏诊断摘要'),
            ),
            TextButton.icon(
              onPressed: () {
                diagnostics.clear();
                Navigator.pop(context);
              },
              icon: const Icon(Icons.delete_outline),
              label: const Text('清除本次诊断摘要'),
            ),
          ],
        ),
      ),
    );
  }
}
