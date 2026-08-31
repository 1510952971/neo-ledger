/// The cross-platform feature contract used by the native clients.
///
/// Keeping this list in code makes feature parity reviewable in CI and in the
/// settings screen. A platform value describes the supported delivery mode:
/// `native` is implemented in the client, `server` is shared through the API,
/// `android` is an Android-only companion capability, and `n/a` is not a
/// meaningful capability for that platform.
class NativeFeature {
  const NativeFeature({
    required this.id,
    required this.label,
    required this.entryPoint,
    required this.availability,
  });

  final String id;
  final String label;
  final String entryPoint;
  final Map<String, String> availability;
}

abstract final class FeatureCatalog {
  static const platforms = <String>[
    'android',
    'ios',
    'windows',
    'macos',
    'web',
  ];

  static const all = <NativeFeature>[
    NativeFeature(
      id: 'dashboard',
      label: '主页与每日财报',
      entryPoint: '主界面',
      availability: _common,
    ),
    NativeFeature(
      id: 'ledger',
      label: '个人账单与多账本',
      entryPoint: '账单',
      availability: _common,
    ),
    NativeFeature(
      id: 'transaction-entry',
      label: '记一笔、编辑、删除与转账',
      entryPoint: '记一笔',
      availability: _common,
    ),
    NativeFeature(
      id: 'accounts-assets',
      label: '账户、资产与卡包',
      entryPoint: '资产',
      availability: _common,
    ),
    NativeFeature(
      id: 'categories',
      label: '分类与自定义字段',
      entryPoint: '设置 / 分类管理',
      availability: _common,
    ),
    NativeFeature(
      id: 'import',
      label: '微信、支付宝、银行账单导入',
      entryPoint: '设置 / 导入',
      availability: _common,
    ),
    NativeFeature(
      id: 'budget',
      label: '预算与超支预警',
      entryPoint: '规划 / 预算',
      availability: _common,
    ),
    NativeFeature(
      id: 'subscription',
      label: '固定订阅',
      entryPoint: '规划 / 订阅',
      availability: _common,
    ),
    NativeFeature(
      id: 'installment',
      label: '免息分期',
      entryPoint: '规划 / 分期',
      availability: _common,
    ),
    NativeFeature(
      id: 'savings-goal',
      label: '存钱罐与储蓄目标',
      entryPoint: '规划 / 存钱罐',
      availability: _common,
    ),
    NativeFeature(
      id: 'settlement',
      label: '多人分账、借贷与结算',
      entryPoint: '账单 / 结算',
      availability: _common,
    ),
    NativeFeature(
      id: 'analytics',
      label: '统计分析、预测与 FIRE',
      entryPoint: '分析',
      availability: _common,
    ),
    NativeFeature(
      id: 'ai',
      label: 'AI 财务助手',
      entryPoint: '主页 / AI 财务助手',
      availability: _common,
    ),
    NativeFeature(
      id: 'automation',
      label: '自动化规则与快捷记账',
      entryPoint: '设置 / 自动化规则',
      availability: _common,
    ),
    NativeFeature(
      id: 'notifications',
      label: '通知中心与待处理提醒',
      entryPoint: '通知中心',
      availability: _common,
    ),
    NativeFeature(
      id: 'server-sync',
      label: '服务器双向同步与离线队列',
      entryPoint: '设置 / 连接与同步',
      availability: _common,
    ),
    NativeFeature(
      id: 'quick-sync',
      label: '快捷指令、NAS 与 P2P 同步',
      entryPoint: '设置 / 快捷同步',
      availability: _common,
    ),
    NativeFeature(
      id: 'security',
      label: '备份、WebDAV、Passkey 与隐私锁',
      entryPoint: '设置 / 隐私与安全',
      availability: _common,
    ),
    NativeFeature(
      id: 'android-notifications',
      label: 'Android 通知支付识别',
      entryPoint: 'Android 自动记账',
      availability: _androidCapture,
    ),
    NativeFeature(
      id: 'android-payment-screen',
      label: 'Android 无障碍支付完成页识别',
      entryPoint: 'Android 自动记账 / 无障碍服务',
      availability: _androidCapture,
    ),
    NativeFeature(
      id: 'updates',
      label: 'GitHub Releases 应用内更新',
      entryPoint: '设置 / 应用更新',
      availability: _common,
    ),
  ];

  static const _common = <String, String>{
    'android': 'native',
    'ios': 'native',
    'windows': 'native',
    'macos': 'native',
    'web': 'server',
  };

  static const _androidCapture = <String, String>{
    'android': 'android',
    'ios': 'n/a',
    'windows': 'n/a',
    'macos': 'n/a',
    'web': 'n/a',
  };
}
