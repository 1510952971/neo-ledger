import 'dart:async';
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' hide Category;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api_client.dart';
import 'feature_catalog.dart';
import 'import_parser.dart';
import 'models.dart';
import 'update_service.dart';

const _brand = Color(0xffa5ff4f);
const _surface = Color(0xff15151d);
const _surfaceAlt = Color(0xff20202a);
const _nativeVersion = '1.2.4';
const _queueKey = 'neo_ledger_offline_queue_v1';
const _coreSnapshotKey = 'neo_ledger_core_snapshot_v1';
const _assetTypes = [
  '房产',
  '车辆',
  '奢侈品',
  '贵金属',
  '收藏品',
  '数码设备',
  '游戏账号',
  '潮流玩具',
  '其他资产',
];

Color _parseHexColor(String value) {
  final normalized = value.trim().replaceFirst('#', '');
  final hex = normalized.length == 6 ? 'FF$normalized' : normalized;
  final parsed = int.tryParse(hex, radix: 16);
  return parsed == null ? Colors.blueGrey : Color(parsed);
}

class NeoLedgerApp extends StatefulWidget {
  const NeoLedgerApp({super.key});

  @override
  State<NeoLedgerApp> createState() => _NeoLedgerAppState();
}

class _NeoLedgerAppState extends State<NeoLedgerApp> {
  late final LedgerController controller;

  @override
  void initState() {
    super.initState();
    controller = LedgerController()..initialize();
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return MaterialApp(
          debugShowCheckedModeBanner: false,
          title: 'Neo Ledger',
          theme: ThemeData(
            brightness: Brightness.dark,
            scaffoldBackgroundColor: _surface,
            colorScheme: ColorScheme.fromSeed(
              seedColor: _brand,
              brightness: Brightness.dark,
            ),
            cardTheme: const CardThemeData(
              color: _surfaceAlt,
              margin: EdgeInsets.zero,
            ),
            inputDecorationTheme: InputDecorationTheme(
              filled: true,
              fillColor: _surfaceAlt,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide.none,
              ),
            ),
            navigationBarTheme: const NavigationBarThemeData(
              backgroundColor: _surfaceAlt,
              indicatorColor: Color(0xff304d25),
            ),
          ),
          home: controller.authenticated
              ? NeoShell(controller: controller)
              : LoginPage(controller: controller),
        );
      },
    );
  }
}

class LedgerController extends ChangeNotifier {
  LedgerController({NeoLedgerApi? api}) : api = api ?? NeoLedgerApi();

  static const _companionChannel = MethodChannel(
    'online.eyeme.neo_ledger/companion',
  );

  final NeoLedgerApi api;
  SessionUser? user;
  List<Ledger> ledgers = const [];
  List<Account> accounts = const [];
  TransactionPage transactions = const TransactionPage(
    items: [],
    total: 0,
    incomeCents: 0,
    expenseCents: 0,
  );
  AnalysisSummary? analysis;
  Forecast? forecast;
  List<CategoryBudget> budgets = const [];
  List<Subscription> subscriptions = const [];
  List<Installment> installments = const [];
  List<SavingsGoal> savingsGoals = const [];
  List<DigitalAsset> assets = const [];
  List<Member> members = const [];
  List<Category> expenseCategories = const [];
  List<Category> incomeCategories = const [];
  Preferences preferences = const Preferences();
  AiReply? lastAiReply;
  Map<String, dynamic> p2pStatus = const {};
  ExchangeRateSnapshot? exchangeRates;
  List<AutomationRule> automationRules = const [];
  QuickSyncStatus? quickSyncStatus;
  String? quickSyncToken;
  List<SecuritySession> securitySessions = const [];
  SecurityAuditPage securityAudit = const SecurityAuditPage(
    events: [],
    hasMore: false,
  );
  List<NotificationItem> notifications = const [];
  PendingTransactionPage pendingTransactions = const PendingTransactionPage(
    items: [],
    total: 0,
    hasMore: false,
  );
  List<OfflineEntry> queue = const [];
  double? monthlyExpense;
  double? annualReturn;
  double? inflationRate;
  int selectedLedgerIndex = 0;
  bool loading = false;
  bool demoMode = false;
  String? error;
  String? cachedAt;
  SharedPreferences? _preferences;
  Future<void>? _refreshOperation;
  Future<void>? _syncOperation;

  bool get authenticated => user != null;
  Ledger? get selectedLedger => ledgers.isEmpty
      ? null
      : ledgers[selectedLedgerIndex.clamp(0, ledgers.length - 1)];
  int get pendingCount => queue.length;
  int get pendingServerCount => pendingTransactions.total;
  int get totalPendingCount => pendingCount + pendingServerCount;
  int get unreadNotificationCount =>
      notifications.where((item) => !item.read).length;

  Future<void> initialize() async {
    _preferences = await SharedPreferences.getInstance();
    await _loadQueue();
    await api.load();
    if (!api.hasSession) return;
    await _loadCoreSnapshot();
    try {
      await refresh();
    } catch (_) {
      error = '暂时无法连接服务器，已显示最近一次缓存数据';
      notifyListeners();
    }
  }

  Future<void> login({
    required String url,
    required String username,
    required String password,
    String? mfaCode,
  }) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await api.setBaseUrl(url);
      user = await api.login(
        username: username,
        password: password,
        mfaCode: mfaCode,
      );
      await refresh();
    } catch (value) {
      user = null;
      error = '$value';
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> register({
    required String url,
    required String username,
    required String email,
    required String displayName,
    required String password,
    String? code,
  }) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await api.setBaseUrl(url);
      user = await api.register(
        username: username,
        email: email,
        displayName: displayName,
        password: password,
        code: code,
      );
      await refresh();
    } catch (value) {
      user = null;
      error = '$value';
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> requestEmailCode({
    required String url,
    required String email,
    required String purpose,
  }) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await api.setBaseUrl(url);
      await api.requestEmailCode(email: email, purpose: purpose);
    } catch (value) {
      error = '$value';
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> resetPassword({
    required String url,
    required String email,
    required String code,
    required String newPassword,
  }) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await api.setBaseUrl(url);
      await api.resetPassword(
        email: email,
        code: code,
        newPassword: newPassword,
      );
    } catch (value) {
      error = '$value';
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  void clearError() {
    if (error == null) return;
    error = null;
    notifyListeners();
  }

  void loadDemo() {
    demoMode = true;
    user = const SessionUser(username: 'demo', displayName: '演示用户');
    ledgers = const [Ledger(id: 1, name: '日常账本', icon: '🏠')];
    accounts = const [
      Account(
        id: 1,
        ledgerId: 1,
        name: '现金账户',
        type: '资产',
        balanceCents: 125000,
        icon: '💳',
      ),
    ];
    transactions = TransactionPage(
      items: [
        TransactionItem(
          id: 2,
          title: '午餐',
          amountCents: 2800,
          type: '支出',
          occurredAt: DateTime.now().toIso8601String(),
          category: '餐饮',
          accountName: '现金账户',
          source: '演示',
        ),
        TransactionItem(
          id: 1,
          title: '工资',
          amountCents: 1250000,
          type: '收入',
          occurredAt: DateTime.now()
              .subtract(const Duration(days: 1))
              .toIso8601String(),
          category: '工资',
          accountName: '现金账户',
          source: '演示',
        ),
      ],
      total: 2,
      incomeCents: 1250000,
      expenseCents: 2800,
    );
    analysis = const AnalysisSummary(
      incomeCents: 1250000,
      expenseCents: 2800,
      balanceCents: 1247200,
      savingRate: 99.8,
      categoryData: [AnalysisBucket(name: '餐饮', amountCents: 2800)],
      moodData: [],
      incomeData: [AnalysisBucket(name: '工资', amountCents: 1250000)],
      trend: [],
      impulseCents: 0,
      needExpenseCents: 2800,
      investmentIncomeCents: 0,
      topCategory: AnalysisBucket(name: '餐饮', amountCents: 2800),
    );
    forecast = null;
    budgets = const [];
    subscriptions = const [];
    installments = const [];
    savingsGoals = const [];
    assets = const [];
    members = const [
      Member(id: 1, ledgerId: 1, name: '我', icon: '🙂', isMe: true),
      Member(id: 2, ledgerId: 1, name: '小明', icon: '👤'),
    ];
    expenseCategories = const [
      Category(id: 1, ledgerId: 1, name: '餐饮', icon: '🍜', color: '#F97316'),
      Category(id: 2, ledgerId: 1, name: '交通', icon: '🚕', color: '#3B82F6'),
      Category(id: 3, ledgerId: 1, name: '购物', icon: '🛍️', color: '#EC4899'),
    ];
    incomeCategories = const [
      Category(id: 101, ledgerId: 1, name: '工资', icon: '💼', color: '#22C55E'),
      Category(
        id: 102,
        ledgerId: 1,
        name: '其它收入',
        icon: '💰',
        color: '#14B8A6',
      ),
    ];
    preferences = const Preferences();
    lastAiReply = null;
    p2pStatus = const {
      'service': 'Neo Ledger P2P',
      'protocol': 'neo-ledger-p2p/2',
      'transport': 'WebRTC DataChannel',
      'peers': 0,
    };
    exchangeRates = const ExchangeRateSnapshot(
      base: 'CNY',
      rates: {'CNY': 1, 'USD': 7.2, 'HKD': 0.92, 'EUR': 7.8},
      source: '演示数据',
      updatedAt: '今天',
    );
    automationRules = const [];
    quickSyncStatus = null;
    quickSyncToken = null;
    securitySessions = const [];
    securityAudit = const SecurityAuditPage(events: [], hasMore: false);
    monthlyExpense = 10000;
    annualReturn = 4;
    inflationRate = 3;
    notifications = const [
      NotificationItem(
        id: 1,
        title: '演示通知',
        message: '这是一条用于验证通知列表的演示消息。',
        read: false,
        createdAt: '刚刚',
      ),
    ];
    pendingTransactions = PendingTransactionPage(
      items: [
        PendingTransaction(
          id: 1,
          title: '待确认的演示消费',
          amountCents: 1680,
          type: '支出',
          occurredAt: DateTime.now().toIso8601String(),
          status: 'pending',
          accountId: 1,
          accountName: '现金账户',
          suggestion: '餐饮',
        ),
      ],
      total: 1,
      hasMore: false,
    );
    error = null;
    notifyListeners();
  }

  Future<void> refresh({bool silent = false}) {
    final inFlight = _refreshOperation;
    if (inFlight != null) return inFlight;
    final operation = _refreshInternal(silent: silent);
    _refreshOperation = operation;
    operation.then<void>(
      (_) {
        if (identical(_refreshOperation, operation)) _refreshOperation = null;
      },
      onError: (Object error, StackTrace stackTrace) {
        if (identical(_refreshOperation, operation)) _refreshOperation = null;
      },
    );
    return operation;
  }

  Future<void> _refreshInternal({required bool silent}) async {
    if (demoMode) return;
    if (!authenticated && !api.hasSession) return;
    if (!silent) {
      loading = true;
      error = null;
      notifyListeners();
    }
    try {
      ledgers = await api.fetchLedgers();
      if (ledgers.isEmpty) throw const ApiException('当前账号还没有账本，请先在网页端创建一个账本');
      if (selectedLedgerIndex >= ledgers.length) selectedLedgerIndex = 0;
      final ledger = selectedLedger!;
      accounts = await api.fetchAccounts(ledger.id);
      transactions = await api.fetchTransactions(ledger.id);
      await _refreshAdvanced(ledger.id);
      await _persistCoreSnapshot();
      error = null;
      if (silent) notifyListeners();
    } catch (value) {
      if (!silent) error = '$value';
      rethrow;
    } finally {
      if (!silent) {
        loading = false;
        notifyListeners();
      }
    }
  }

  Future<void> selectLedger(int index) async {
    if (index < 0 || index >= ledgers.length) return;
    selectedLedgerIndex = index;
    notifyListeners();
    if (!demoMode) await refresh();
  }

  Future<void> saveLedger({
    Ledger? existing,
    required String name,
    required String icon,
  }) async {
    final normalizedName = name.trim();
    final normalizedIcon = icon.trim().isEmpty ? '📒' : icon.trim();
    if (normalizedName.isEmpty) throw const ApiException('请填写账本名称');
    if (demoMode) {
      final updated = Ledger(
        id: existing?.id ?? DateTime.now().millisecondsSinceEpoch,
        name: normalizedName,
        icon: normalizedIcon,
        updatedAt: DateTime.now().toIso8601String(),
      );
      if (existing == null) {
        ledgers = [...ledgers, updated];
        selectedLedgerIndex = ledgers.length - 1;
      } else {
        ledgers = [
          for (final item in ledgers) item.id == existing.id ? updated : item,
        ];
      }
      notifyListeners();
      return;
    }
    if (existing != null &&
        (existing.updatedAt == null || existing.updatedAt!.isEmpty)) {
      throw const ApiException('账本缺少版本信息，请刷新后再编辑');
    }
    await api.saveLedger(
      id: existing?.id,
      name: normalizedName,
      icon: normalizedIcon,
      expectedUpdatedAt: existing?.updatedAt,
    );
    await refresh();
  }

  Future<void> deleteLedger(Ledger item) async {
    if (ledgers.length <= 1) throw const ApiException('至少需要保留一个账本');
    if (demoMode) {
      ledgers = ledgers.where((ledger) => ledger.id != item.id).toList();
      final lastIndex = ledgers.length - 1;
      selectedLedgerIndex = selectedLedgerIndex > lastIndex
          ? lastIndex
          : selectedLedgerIndex;
      if (selectedLedgerIndex < 0) selectedLedgerIndex = 0;
      notifyListeners();
      return;
    }
    final updatedAt = item.updatedAt;
    if (updatedAt == null || updatedAt.isEmpty) {
      throw const ApiException('账本缺少版本信息，请刷新后再删除');
    }
    await api.deleteLedger(id: item.id, expectedUpdatedAt: updatedAt);
    selectedLedgerIndex = 0;
    await refresh();
  }

  Future<void> saveAccount({
    Account? existing,
    required String name,
    required String type,
    required double balance,
    int? billDay,
    int? repaymentDay,
    required bool isInvestment,
    required String currency,
    required String assetClass,
  }) async {
    final ledger = selectedLedger;
    final normalizedName = name.trim();
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (normalizedName.isEmpty || balance < 0) {
      throw const ApiException('请填写账户名称和有效余额');
    }
    if (demoMode) {
      final rawCents = (balance * 100).round();
      final cents = type == '负债' ? -rawCents : rawCents;
      final updated = Account(
        id: existing?.id ?? DateTime.now().millisecondsSinceEpoch,
        ledgerId: ledger.id,
        name: normalizedName,
        type: type,
        balanceCents: cents,
        currency: currency,
        icon: existing?.icon ?? (type == '负债' ? '💳' : '💰'),
        updatedAt: DateTime.now().toIso8601String(),
        isInvestment: isInvestment,
        assetClass: assetClass,
        billDay: billDay,
        repaymentDay: repaymentDay,
      );
      if (existing == null) {
        accounts = [...accounts, updated];
      } else {
        accounts = [
          for (final item in accounts) item.id == existing.id ? updated : item,
        ];
      }
      notifyListeners();
      return;
    }
    if (existing != null &&
        (existing.updatedAt == null || existing.updatedAt!.isEmpty)) {
      throw const ApiException('账户缺少版本信息，请刷新后再编辑');
    }
    await api.saveAccount(
      id: existing?.id,
      ledgerId: ledger.id,
      name: normalizedName,
      type: type,
      balance: balance,
      billDay: billDay,
      repaymentDay: repaymentDay,
      isInvestment: isInvestment,
      currency: currency,
      assetClass: assetClass,
      expectedUpdatedAt: existing?.updatedAt,
    );
    await refresh();
  }

  Future<void> deleteAccount(Account item) async {
    if (demoMode) {
      accounts = accounts.where((account) => account.id != item.id).toList();
      notifyListeners();
      return;
    }
    final updatedAt = item.updatedAt;
    if (updatedAt == null || updatedAt.isEmpty) {
      throw const ApiException('账户缺少版本信息，请刷新后再删除');
    }
    await api.deleteAccount(id: item.id, expectedUpdatedAt: updatedAt);
    await refresh();
  }

  Future<void> transfer({
    required String kind,
    required int fromAccountId,
    required int toAccountId,
    required double amount,
    String? note,
  }) async {
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (amount <= 0) throw const ApiException('转账金额必须大于 0');
    if (fromAccountId == toAccountId) {
      throw const ApiException('转出和转入账户不能相同');
    }
    final from = accounts.where((item) => item.id == fromAccountId).firstOrNull;
    final to = accounts.where((item) => item.id == toAccountId).firstOrNull;
    if (from == null ||
        to == null ||
        from.ledgerId != ledger.id ||
        to.ledgerId != ledger.id) {
      throw const ApiException('请选择当前账本中的有效账户');
    }
    if (from.type != '资产') throw const ApiException('转出账户必须是资产账户');
    if (kind == '账户转账' && to.type != '资产') {
      throw const ApiException('账户转账的转入账户必须是资产账户');
    }
    if (kind == '信用卡还款' && to.type != '负债') {
      throw const ApiException('信用卡还款的转入账户必须是负债账户');
    }
    if (!const ['账户转账', '信用卡还款'].contains(kind)) {
      throw const ApiException('转账类型无效');
    }
    if (from.currency != to.currency) throw const ApiException('转账双方币种必须一致');
    final cents = (amount * 100).round();
    if (cents <= 0) throw const ApiException('转账金额过小');
    if (from.balanceCents < cents) throw const ApiException('转出账户余额不足');
    if (demoMode) {
      accounts = [
        for (final item in accounts)
          if (item.id == from.id)
            item.copyWith(
              balanceCents: item.balanceCents - cents,
              updatedAt: DateTime.now().toIso8601String(),
            )
          else if (item.id == to.id)
            item.copyWith(
              balanceCents: item.balanceCents + cents,
              updatedAt: DateTime.now().toIso8601String(),
            )
          else
            item,
      ];
      notifyListeners();
      return;
    }
    await api.transfer(
      ledgerId: ledger.id,
      kind: kind,
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: amount,
      occurredAt: DateTime.now().toUtc().toIso8601String(),
      originalTimezone: 'Asia/Shanghai',
      note: note,
    );
    await refresh();
  }

  Future<void> saveBaseUrl(String value) async {
    final normalized = value.trim().replaceFirst(RegExp(r'/$'), '');
    if (!normalized.startsWith('http://') &&
        !normalized.startsWith('https://')) {
      throw const ApiException('地址必须以 http:// 或 https:// 开头');
    }
    await api.setBaseUrl(normalized);
    notifyListeners();
  }

  bool get isAndroid =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Future<Map<String, dynamic>> androidCaptureStatus() async {
    if (!isAndroid) return const {};
    try {
      final value = await _companionChannel.invokeMethod<dynamic>('status');
      if (value is Map) {
        return value.map((key, item) => MapEntry('$key', item));
      }
      return const {};
    } on PlatformException catch (error) {
      throw ApiException(error.message ?? '无法读取 Android 自动记账状态');
    }
  }

  Future<void> configureAndroidCapture({
    required String secret,
    required bool wechat,
    required bool alipay,
    required bool marketApps,
    required String extraPackages,
  }) async {
    if (!isAndroid) throw const ApiException('当前客户端不是 Android');
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    final normalized = secret.trim();
    if (normalized.length < 20) {
      throw const ApiException('请粘贴完整的自动记账连接密钥');
    }
    try {
      await _companionChannel.invokeMethod<void>('configure', {
        'endpoint': api.baseUrl,
        'secret': normalized,
        'ledgerId': ledger.id,
        'wechat': wechat,
        'alipay': alipay,
        'marketApps': marketApps,
        'extraPackages': extraPackages.trim(),
      });
      await api.setAutoLogSecret(normalized);
      notifyListeners();
    } on PlatformException catch (error) {
      throw ApiException(error.message ?? 'Android 自动记账配置失败');
    }
  }

  Future<void> openAndroidNotificationSettings() async {
    if (!isAndroid) return;
    try {
      await _companionChannel.invokeMethod<void>('openNotificationSettings');
    } on PlatformException catch (error) {
      throw ApiException(error.message ?? '无法打开通知使用权设置');
    }
  }

  Future<void> openAndroidAccessibilitySettings() async {
    if (!isAndroid) return;
    try {
      await _companionChannel.invokeMethod<void>('openAccessibilitySettings');
    } on PlatformException catch (error) {
      throw ApiException(error.message ?? '无法打开无障碍设置');
    }
  }

  Future<void> openAndroidAutostartSettings() async {
    if (!isAndroid) return;
    try {
      await _companionChannel.invokeMethod<void>('openAutostartSettings');
    } on PlatformException catch (error) {
      throw ApiException(error.message ?? '无法打开厂商自启动设置');
    }
  }

  Future<void> openAndroidBatterySettings() async {
    if (!isAndroid) return;
    try {
      await _companionChannel.invokeMethod<void>('openBatterySettings');
    } on PlatformException catch (error) {
      throw ApiException(error.message ?? '无法打开系统省电设置');
    }
  }

  Future<Map<String, dynamic>> sendAndroidTestBill() async {
    if (!isAndroid) throw const ApiException('当前客户端不是 Android');
    try {
      final value = await _companionChannel.invokeMethod<dynamic>('sendTest');
      if (value is Map) {
        return value.map((key, item) => MapEntry('$key', item));
      }
      return const {};
    } on PlatformException catch (error) {
      throw ApiException(error.message ?? '无法发送 Android 测试账单');
    }
  }

  Future<void> flushAndroidPending() async {
    if (!isAndroid) return;
    try {
      await _companionChannel.invokeMethod<void>('flushPending');
    } on PlatformException catch (error) {
      throw ApiException(error.message ?? '无法发送待处理账单');
    }
  }

  Future<Map<String, dynamic>> installAndroidUpdate({
    required String version,
    required String apkUrl,
    required String apkName,
    String? checksumUrl,
  }) async {
    if (!isAndroid) throw const ApiException('当前客户端不是 Android');
    try {
      final value = await _companionChannel.invokeMethod<dynamic>(
        'installUpdate',
        {
          'version': version,
          'apkUrl': apkUrl,
          'apkName': apkName,
          'checksumUrl': checksumUrl ?? '',
        },
      );
      if (value is Map) {
        return value.map((key, item) => MapEntry('$key', item));
      }
      return const {};
    } on PlatformException catch (error) {
      throw ApiException(error.message ?? '无法安装 Android 更新');
    }
  }

  Future<void> saveCategory({
    Category? existing,
    required bool income,
    required String name,
    required String icon,
    required String color,
    required bool isActive,
  }) async {
    final ledger = selectedLedger;
    final normalizedName = name.trim();
    final normalizedIcon = icon.trim().isEmpty ? '🧾' : icon.trim();
    final normalizedColor = color.trim().isEmpty ? '#6B7280' : color.trim();
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (normalizedName.isEmpty) throw const ApiException('请填写分类名称');
    if (!RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(normalizedColor)) {
      throw const ApiException('颜色必须是六位十六进制格式，例如 #6B7280');
    }
    if (existing?.isSystem == true) {
      throw const ApiException('系统分类不能编辑');
    }
    if (demoMode) {
      final source = income ? incomeCategories : expenseCategories;
      final nextId =
          source.fold<int>(0, (max, item) => item.id > max ? item.id : max) + 1;
      final updated =
          (existing ??
                  Category(
                    id: nextId,
                    ledgerId: ledger.id,
                    name: normalizedName,
                    icon: normalizedIcon,
                    color: normalizedColor,
                  ))
              .copyWith(
                name: normalizedName,
                icon: normalizedIcon,
                color: normalizedColor,
                isActive: isActive,
              );
      final result = [
        for (final item in source) item.id == updated.id ? updated : item,
        if (existing == null) updated,
      ];
      if (income) {
        incomeCategories = result;
      } else {
        expenseCategories = result;
      }
      notifyListeners();
      return;
    }
    await api.saveCategory(
      id: existing?.id,
      ledgerId: ledger.id,
      income: income,
      name: normalizedName,
      icon: normalizedIcon,
      color: normalizedColor,
      isActive: existing == null ? null : isActive,
    );
    await _refreshAdvanced(ledger.id);
    notifyListeners();
  }

  Future<void> deleteCategory(Category item, {required bool income}) async {
    if (item.isSystem) throw const ApiException('系统分类不能删除');
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (demoMode) {
      if (income) {
        incomeCategories = incomeCategories
            .where((value) => value.id != item.id)
            .toList();
      } else {
        expenseCategories = expenseCategories
            .where((value) => value.id != item.id)
            .toList();
      }
      notifyListeners();
      return;
    }
    await api.deleteCategory(id: item.id, ledgerId: ledger.id, income: income);
    await _refreshAdvanced(ledger.id);
    notifyListeners();
  }

  Future<void> savePreferences({
    required String theme,
    required bool lockEnabled,
    String? pin,
  }) async {
    final normalizedTheme = theme.trim().isEmpty ? 'cream' : theme.trim();
    final normalizedPin = pin?.trim();
    if (lockEnabled &&
        !preferences.lockEnabled &&
        (normalizedPin == null || normalizedPin.isEmpty)) {
      throw const ApiException('首次开启隐私锁必须设置 PIN');
    }
    preferences = Preferences(theme: normalizedTheme, lockEnabled: lockEnabled);
    notifyListeners();
    if (demoMode) return;
    await api.updatePreferences(
      theme: normalizedTheme,
      enabled: lockEnabled,
      pin: normalizedPin,
    );
    preferences = await api.fetchPreferences();
    notifyListeners();
  }

  Future<bool> verifyPin(String pin) async {
    final normalizedPin = pin.trim();
    if (normalizedPin.isEmpty) return false;
    if (demoMode) return normalizedPin == '1234';
    return api.verifyPreferencesPin(normalizedPin);
  }

  Future<AiReply> askAi(String message, {bool consentExternal = false}) async {
    final ledger = selectedLedger;
    final normalizedMessage = message.trim();
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (normalizedMessage.isEmpty) throw const ApiException('请输入想咨询的问题');
    if (demoMode) {
      final reply = AiReply(
        answer: '演示模式：我可以根据当前账本帮助你分析收支、预算和分类。联网登录后可获取真实数据分析。',
        provider: 'demo',
      );
      lastAiReply = reply;
      notifyListeners();
      return reply;
    }
    final reply = await api.askAi(
      ledgerId: ledger.id,
      message: normalizedMessage,
      consentExternal: consentExternal,
    );
    lastAiReply = reply;
    notifyListeners();
    return reply;
  }

  Future<String?> syncWebDav({
    required String action,
    required String url,
    required String username,
    required String password,
  }) async {
    final normalizedUrl = url.trim();
    if (action != 'upload' && action != 'download') {
      throw const ApiException('WebDAV 操作无效');
    }
    if (!normalizedUrl.startsWith('https://')) {
      throw const ApiException('WebDAV 地址必须使用 HTTPS');
    }
    final payload = action == 'upload' ? await exportBackup() : null;
    late final Map<String, dynamic> result;
    if (demoMode) {
      result = <String, dynamic>{
        'ok': true,
        'syncedAt': DateTime.now().toIso8601String(),
      };
      if (payload != null) result['payload'] = payload;
    } else {
      result = await api.syncWebDav(
        action: action,
        url: normalizedUrl,
        username: username,
        password: password,
        payload: payload,
      );
    }
    final downloaded = result['payload'];
    return downloaded is String ? downloaded : null;
  }

  Future<String> exportBackup() {
    if (!demoMode) return api.exportBackup();
    return Future.value(
      jsonEncode({
        'version': 23,
        'demo': true,
        'exportedAt': DateTime.now().toIso8601String(),
        'ledgers': ledgers.length,
        'accounts': accounts.length,
        'transactions': transactions.items.length,
      }),
    );
  }

  Future<Map<String, dynamic>> restoreBackup(
    String rawBackup, {
    required bool dryRun,
    String? expectedPlanChecksum,
  }) async {
    if (demoMode) {
      throw const ApiException('演示模式不支持恢复，请登录真实账本后操作');
    }
    final result = await api.restoreBackup(
      rawBackup,
      dryRun: dryRun,
      expectedPlanChecksum: expectedPlanChecksum,
    );
    if (!dryRun) await refresh();
    return result;
  }

  Future<void> addEntry({
    required double amount,
    required String title,
    required String category,
    required String type,
  }) async {
    final ledger = selectedLedger;
    final account = accounts.isEmpty ? null : accounts.first;
    if (ledger == null || account == null) {
      throw const ApiException('没有可用的账本账户');
    }
    final entry = OfflineEntry(
      offlineId: 'native-${DateTime.now().microsecondsSinceEpoch}',
      ledgerId: ledger.id,
      accountId: account.id,
      amount: amount,
      type: type,
      title: title,
      category: category,
      occurredAt: DateTime.now().toIso8601String(),
    );
    if (demoMode) {
      final item = TransactionItem(
        id: DateTime.now().millisecondsSinceEpoch,
        title: title,
        amountCents: (amount * 100).round(),
        type: type,
        occurredAt: entry.occurredAt,
        category: category,
        accountName: account.name,
        source: '本机演示',
      );
      final items = [item, ...transactions.items];
      final income =
          transactions.incomeCents + (type == '收入' ? item.amountCents : 0);
      final expense =
          transactions.expenseCents + (type == '支出' ? item.amountCents : 0);
      transactions = TransactionPage(
        items: items,
        total: items.length,
        incomeCents: income,
        expenseCents: expense,
      );
      notifyListeners();
      return;
    }
    queue = [...queue, entry];
    await _persistQueue();
    notifyListeners();
    try {
      await syncQueue();
    } catch (_) {
      // 保留在队列，生命周期轮询会在恢复联网后自动重试。
    }
  }

  Future<void> syncQueue({bool silent = false}) {
    final inFlight = _syncOperation;
    if (inFlight != null) return inFlight;
    final operation = _syncQueueInternal(silent: silent);
    _syncOperation = operation;
    operation.then<void>(
      (_) {
        if (identical(_syncOperation, operation)) _syncOperation = null;
      },
      onError: (Object error, StackTrace stackTrace) {
        if (identical(_syncOperation, operation)) _syncOperation = null;
      },
    );
    return operation;
  }

  Future<void> _syncQueueInternal({required bool silent}) async {
    if (queue.isNotEmpty) {
      final synced = await api.syncEntries(queue);
      final syncedSet = synced.toSet();
      queue = queue
          .where((item) => !syncedSet.contains(item.offlineId))
          .toList();
      await _persistQueue();
    }
    await refresh(silent: silent);
    notifyListeners();
  }

  Future<void> addMember({required String name, String icon = '👤'}) async {
    final ledger = selectedLedger;
    final normalizedName = name.trim();
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (normalizedName.isEmpty) throw const ApiException('请输入参与人名称');
    if (demoMode) {
      final nextId =
          members.fold<int>(0, (max, item) => item.id > max ? item.id : max) +
          1;
      members = [
        ...members,
        Member(
          id: nextId,
          ledgerId: ledger.id,
          name: normalizedName,
          icon: icon,
        ),
      ];
      notifyListeners();
      return;
    }
    await api.createMember(
      ledgerId: ledger.id,
      name: normalizedName,
      icon: icon,
    );
    await _refreshAdvanced(ledger.id);
    notifyListeners();
  }

  Future<void> settleMember({
    required Member member,
    required double amount,
    required String direction,
  }) async {
    final ledger = selectedLedger;
    final account = accounts.isEmpty ? null : accounts.first;
    if (ledger == null || account == null) {
      throw const ApiException('没有可用的账本账户');
    }
    if (member.isMe) throw const ApiException('不能把自己作为结算对象');
    if (!amount.isFinite || amount <= 0) throw const ApiException('结算金额必须大于 0');
    if (direction != 'owesMe' && direction != 'iOwe') {
      throw const ApiException('结算方向无效');
    }
    if (demoMode) {
      final now = DateTime.now().toIso8601String();
      final item = TransactionItem(
        id: DateTime.now().millisecondsSinceEpoch,
        ledgerId: ledger.id,
        accountId: account.id,
        title: '${member.name} · 人情平账',
        amountCents: (amount * 100).round(),
        type: direction == 'owesMe' ? '收入' : '支出',
        occurredAt: now,
        category: direction == 'owesMe' ? null : '其它',
        incomeCategory: direction == 'owesMe' ? '其它收入' : null,
        accountName: account.name,
        source: '分账结算',
      );
      final items = [item, ...transactions.items];
      transactions = TransactionPage(
        items: items,
        total: items.length,
        incomeCents:
            transactions.incomeCents + (item.isIncome ? item.amountCents : 0),
        expenseCents:
            transactions.expenseCents + (item.isIncome ? 0 : item.amountCents),
      );
      notifyListeners();
      return;
    }
    await api.settleMember(
      ledgerId: ledger.id,
      memberId: member.id,
      amount: amount,
      direction: direction,
    );
    await refresh();
  }

  Future<void> saveFinancialSettings({
    required double monthlyExpense,
    required double annualReturn,
    required double inflationRate,
  }) async {
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (!monthlyExpense.isFinite || monthlyExpense < 100) {
      throw const ApiException('月度支出必须不小于 100');
    }
    if (!annualReturn.isFinite || annualReturn < 0 || annualReturn > 30) {
      throw const ApiException('年化收益率必须在 0% 到 30% 之间');
    }
    if (!inflationRate.isFinite || inflationRate < 0 || inflationRate > 50) {
      throw const ApiException('通胀率必须在 0% 到 50% 之间');
    }
    this.monthlyExpense = monthlyExpense;
    this.annualReturn = annualReturn;
    this.inflationRate = inflationRate;
    notifyListeners();
    if (demoMode) return;
    await Future.wait([
      api.saveFireSettings(
        ledgerId: ledger.id,
        monthlyExpense: monthlyExpense,
        annualReturn: annualReturn,
      ),
      api.saveEconomicSettings(
        ledgerId: ledger.id,
        inflationRate: inflationRate,
      ),
    ]);
    await _refreshAdvanced(ledger.id);
    notifyListeners();
  }

  Future<Map<String, dynamic>> previewBillImport(
    List<Map<String, dynamic>> items,
  ) async {
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (items.isEmpty) throw const ApiException('请至少提供一条流水');
    if (!demoMode) {
      return api.previewBillImport(ledgerId: ledger.id, items: items);
    }
    final normalized = <Map<String, dynamic>>[];
    for (final item in items) {
      if (item['merchant'] == null || item['amount'] == null) continue;
      final copy = Map<String, dynamic>.from(item);
      final account = _resolveImportAccount(copy);
      if (account != null) {
        copy['accountId'] = account.id;
        copy['accountName'] = account.name;
      }
      normalized.add(copy);
    }
    return {
      'items': normalized,
      'detected': normalized.length,
      'received': items.length,
      'duplicates': 0,
      'possibleDuplicates': 0,
      'unmapped': normalized
          .where((item) => _resolveImportAccount(item) == null)
          .length,
      'unconfirmed': items.length - normalized.length,
      'truncated': 0,
    };
  }

  Future<Map<String, dynamic>> importBills(
    List<Map<String, dynamic>> items,
  ) async {
    final ledger = selectedLedger;
    if (ledger == null || accounts.isEmpty) {
      throw const ApiException('没有可用的账本账户');
    }
    if (items.isEmpty) throw const ApiException('没有可导入的流水');
    if (!demoMode) {
      final result = await api.importBills(ledgerId: ledger.id, items: items);
      await refresh();
      return result;
    }
    final imported = <TransactionItem>[];
    for (final raw in items) {
      final amount = double.tryParse('${raw['amount'] ?? ''}');
      final merchant = '${raw['merchant'] ?? raw['title'] ?? '导入流水'}'.trim();
      final account = _resolveImportAccount(raw);
      if (account == null) continue;
      if (amount == null || amount <= 0 || merchant.isEmpty) continue;
      final occurredAt = '${raw['occurredAt'] ?? raw['occurred_at'] ?? ''}'
          .replaceFirst(' ', 'T');
      final type = raw['type'] == '收入' ? '收入' : '支出';
      imported.add(
        TransactionItem(
          id: DateTime.now().microsecondsSinceEpoch + imported.length,
          ledgerId: ledger.id,
          accountId: account.id,
          title: merchant,
          amountCents: (amount * 100).round(),
          type: type,
          occurredAt: occurredAt.isEmpty
              ? DateTime.now().toIso8601String()
              : occurredAt,
          category: type == '支出' ? '${raw['category'] ?? '其它'}' : null,
          incomeCategory: type == '收入'
              ? '${raw['incomeCategory'] ?? '其它收入'}'
              : null,
          accountName: account.name,
          source: '${raw['sourceName'] ?? raw['source'] ?? '账单导入'}',
        ),
      );
    }
    final itemsAfter = [...imported, ...transactions.items];
    final income = imported.fold<int>(
      transactions.incomeCents,
      (sum, item) => sum + (item.isIncome ? item.amountCents : 0),
    );
    final expense = imported.fold<int>(
      transactions.expenseCents,
      (sum, item) => sum + (item.isIncome ? 0 : item.amountCents),
    );
    transactions = TransactionPage(
      items: itemsAfter,
      total: itemsAfter.length,
      incomeCents: income,
      expenseCents: expense,
    );
    notifyListeners();
    return {
      'ok': true,
      'imported': imported.length,
      'duplicates': 0,
      'skipped': items.length - imported.length,
    };
  }

  Account? _resolveImportAccount(Map<String, dynamic> raw) {
    final requestedId = int.tryParse('${raw['accountId'] ?? ''}') ?? 0;
    if (requestedId > 0) {
      for (final account in accounts) {
        if (account.id == requestedId) return account;
      }
    }
    final candidates = [
      '${raw['accountName'] ?? ''}'.trim(),
      '${raw['paymentMethod'] ?? ''}'.trim(),
    ].where((item) => item.isNotEmpty).map((item) => item.toLowerCase());
    for (final candidate in candidates) {
      for (final account in accounts) {
        if (account.name.toLowerCase() == candidate) return account;
      }
    }
    return null;
  }

  Future<void> logout() async {
    await api.logout();
    await _preferences?.remove(_coreSnapshotKey);
    user = null;
    demoMode = false;
    ledgers = const [];
    accounts = const [];
    transactions = const TransactionPage(
      items: [],
      total: 0,
      incomeCents: 0,
      expenseCents: 0,
    );
    analysis = null;
    forecast = null;
    budgets = const [];
    subscriptions = const [];
    installments = const [];
    savingsGoals = const [];
    assets = const [];
    members = const [];
    expenseCategories = const [];
    incomeCategories = const [];
    preferences = const Preferences();
    lastAiReply = null;
    p2pStatus = const {};
    exchangeRates = null;
    automationRules = const [];
    quickSyncStatus = null;
    quickSyncToken = null;
    securitySessions = const [];
    securityAudit = const SecurityAuditPage(events: [], hasMore: false);
    notifications = const [];
    pendingTransactions = const PendingTransactionPage(
      items: [],
      total: 0,
      hasMore: false,
    );
    monthlyExpense = null;
    annualReturn = null;
    inflationRate = null;
    cachedAt = null;
    notifyListeners();
  }

  Future<void> _refreshAdvanced(int ledgerId) async {
    final values = await Future.wait<dynamic>([
      _optional(() => api.fetchAnalysis(ledgerId)),
      _optional(() => api.fetchBudgets(ledgerId)),
      _optional(() => api.fetchSubscriptions(ledgerId)),
      _optional(() => api.fetchInstallments(ledgerId)),
      _optional(() => api.fetchSavingsGoals(ledgerId)),
      _optional(() => api.fetchForecast(ledgerId)),
      _optional(() => api.fetchAssets(ledgerId)),
      _optional(() => api.fetchNotifications(ledgerId)),
      _optional(() => api.fetchPendingTransactions(ledgerId)),
      _optional(() => api.fetchMembers(ledgerId)),
      _optional(() => api.fetchFireSettings(ledgerId)),
      _optional(() => api.fetchEconomicSettings(ledgerId)),
      _optional(() => api.fetchCategories(ledgerId, income: false)),
      _optional(() => api.fetchCategories(ledgerId, income: true)),
      _optional(() => api.fetchPreferences()),
      _optional(() => api.fetchP2pStatus()),
      _optional(() => api.fetchExchangeRates()),
      _optional(() => api.fetchAutomationRules(ledgerId)),
      _optional(() => api.fetchQuickSyncStatus()),
      _optional(() => api.fetchSecuritySessions()),
      _optional(() => api.fetchSecurityAudit()),
    ]);
    if (values[0] is AnalysisSummary) analysis = values[0] as AnalysisSummary;
    if (values[1] is List<CategoryBudget>) {
      budgets = values[1] as List<CategoryBudget>;
    }
    if (values[2] is List<Subscription>) {
      subscriptions = values[2] as List<Subscription>;
    }
    if (values[3] is List<Installment>) {
      installments = values[3] as List<Installment>;
    }
    if (values[4] is List<SavingsGoal>) {
      savingsGoals = values[4] as List<SavingsGoal>;
    }
    if (values[5] is Forecast) forecast = values[5] as Forecast;
    if (values[6] is List<DigitalAsset>) {
      assets = values[6] as List<DigitalAsset>;
    }
    if (values[7] is List<NotificationItem>) {
      notifications = values[7] as List<NotificationItem>;
    }
    if (values[8] is PendingTransactionPage) {
      pendingTransactions = values[8] as PendingTransactionPage;
    }
    if (values[9] is List<Member>) members = values[9] as List<Member>;
    final fire = values[10];
    if (fire is Map<String, dynamic>) {
      final monthly = num.tryParse('${fire['monthlyExpense'] ?? ''}');
      final annual = num.tryParse('${fire['annualReturn'] ?? ''}');
      if (monthly != null) monthlyExpense = monthly.toDouble();
      if (annual != null) annualReturn = annual.toDouble();
    }
    final economic = values[11];
    if (economic is Map<String, dynamic>) {
      final inflation = num.tryParse('${economic['inflationRate'] ?? ''}');
      if (inflation != null) inflationRate = inflation.toDouble();
    }
    if (values[12] is List<Category>) {
      expenseCategories = values[12] as List<Category>;
    }
    if (values[13] is List<Category>) {
      incomeCategories = values[13] as List<Category>;
    }
    if (values[14] is Preferences) preferences = values[14] as Preferences;
    if (values[15] is Map<String, dynamic>) {
      p2pStatus = values[15] as Map<String, dynamic>;
    }
    if (values[16] is ExchangeRateSnapshot) {
      exchangeRates = values[16] as ExchangeRateSnapshot;
    }
    if (values[17] is List<AutomationRule>) {
      automationRules = values[17] as List<AutomationRule>;
    }
    if (values[18] is QuickSyncStatus) {
      quickSyncStatus = values[18] as QuickSyncStatus;
    }
    if (values[19] is List<SecuritySession>) {
      securitySessions = values[19] as List<SecuritySession>;
    }
    if (values[20] is SecurityAuditPage) {
      securityAudit = values[20] as SecurityAuditPage;
    }
    await _persistCoreSnapshot();
  }

  Future<void> markNotificationsRead() async {
    if (notifications.isEmpty) return;
    final ledger = selectedLedger;
    if (!demoMode && ledger != null) {
      await api.markNotificationsRead(ledger.id);
    }
    notifications = notifications
        .map((item) => item.copyWith(read: true))
        .toList();
    notifyListeners();
  }

  Future<void> refreshExchangeRates() async {
    if (demoMode) return;
    exchangeRates = await api.fetchExchangeRates();
    await _persistCoreSnapshot();
    notifyListeners();
  }

  Future<void> refreshAutomationRules() async {
    final ledger = selectedLedger;
    if (demoMode || ledger == null) return;
    automationRules = await api.fetchAutomationRules(ledger.id);
    await _persistCoreSnapshot();
    notifyListeners();
  }

  Future<void> createAutomationRule({
    required String name,
    required int priority,
    required bool enabled,
    required Map<String, dynamic> conditions,
    required Map<String, dynamic> actions,
  }) async {
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (name.trim().isEmpty) throw const ApiException('请输入规则名称');
    if (demoMode) {
      automationRules = [
        ...automationRules,
        AutomationRule(
          id: 'demo-${DateTime.now().microsecondsSinceEpoch}',
          name: name.trim(),
          priority: priority,
          enabled: enabled,
          conditions: conditions,
          actions: actions,
        ),
      ];
      notifyListeners();
      return;
    }
    await api.createAutomationRule(
      ledgerId: ledger.id,
      name: name,
      priority: priority,
      enabled: enabled,
      conditions: conditions,
      actions: actions,
    );
    await refreshAutomationRules();
  }

  Future<void> updateAutomationRuleEnabled(
    AutomationRule rule,
    bool enabled,
  ) async {
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (demoMode) {
      automationRules = automationRules
          .map(
            (item) =>
                item.id == rule.id ? item.copyWith(enabled: enabled) : item,
          )
          .toList();
      notifyListeners();
      return;
    }
    await api.updateAutomationRule(
      id: rule.id,
      ledgerId: ledger.id,
      enabled: enabled,
    );
    await refreshAutomationRules();
  }

  Future<void> updateAutomationRule({
    required AutomationRule rule,
    required String name,
    required int priority,
    required bool enabled,
    required Map<String, dynamic> conditions,
    required Map<String, dynamic> actions,
  }) async {
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (name.trim().isEmpty) throw const ApiException('请输入规则名称');
    if (demoMode) {
      automationRules = automationRules
          .map(
            (item) => item.id == rule.id
                ? item.copyWith(
                    name: name.trim(),
                    priority: priority,
                    enabled: enabled,
                    conditions: conditions,
                    actions: actions,
                  )
                : item,
          )
          .toList();
      notifyListeners();
      return;
    }
    await api.updateAutomationRule(
      id: rule.id,
      ledgerId: ledger.id,
      name: name,
      priority: priority,
      enabled: enabled,
      conditions: conditions,
      actions: actions,
    );
    await refreshAutomationRules();
  }

  Future<void> deleteAutomationRule(AutomationRule rule) async {
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (demoMode) {
      automationRules = automationRules
          .where((item) => item.id != rule.id)
          .toList();
      notifyListeners();
      return;
    }
    await api.deleteAutomationRule(id: rule.id, ledgerId: ledger.id);
    await refreshAutomationRules();
  }

  Future<void> refreshQuickSync() async {
    if (demoMode) return;
    quickSyncStatus = await api.fetchQuickSyncStatus();
    await _persistCoreSnapshot();
    notifyListeners();
  }

  Future<String> createQuickSyncToken({
    required String label,
    required int expiresInDays,
    required String scope,
  }) async {
    if (demoMode) {
      quickSyncToken = 'demo-${DateTime.now().microsecondsSinceEpoch}';
      final now = DateTime.now();
      quickSyncStatus = QuickSyncStatus(
        active: true,
        tokenPrefix: quickSyncToken!.substring(0, 12),
        label: label.trim().isEmpty ? '自动记账连接' : label.trim(),
        scope: scope,
        createdAt: now.toIso8601String(),
        expiresAt: now.add(Duration(days: expiresInDays)).toIso8601String(),
        processedCount: 0,
      );
      notifyListeners();
      return quickSyncToken!;
    }
    final token = await api.createQuickSyncToken(
      label: label,
      expiresInDays: expiresInDays,
      scope: scope,
    );
    quickSyncToken = token;
    await refreshQuickSync();
    return token;
  }

  Future<void> revokeQuickSyncToken() async {
    if (!demoMode) await api.revokeQuickSyncToken();
    quickSyncToken = null;
    if (demoMode) quickSyncStatus = const QuickSyncStatus(active: false);
    if (!demoMode) await refreshQuickSync();
    notifyListeners();
  }

  Future<void> refreshSecurityCenter() async {
    if (demoMode) return;
    final values = await Future.wait<dynamic>([
      api.fetchSecuritySessions(),
      api.fetchSecurityAudit(),
    ]);
    securitySessions = values[0] as List<SecuritySession>;
    securityAudit = values[1] as SecurityAuditPage;
    await _persistCoreSnapshot();
    notifyListeners();
  }

  Future<void> revokeSecuritySession(SecuritySession session) async {
    if (demoMode) {
      securitySessions = securitySessions
          .where((item) => item.id != session.id)
          .toList();
      notifyListeners();
      return;
    }
    await api.revokeSecuritySession(sessionId: session.id);
    await refreshSecurityCenter();
  }

  Future<void> revokeOtherSecuritySessions() async {
    if (demoMode) {
      securitySessions = securitySessions
          .where((item) => item.current)
          .toList();
      notifyListeners();
      return;
    }
    await api.revokeSecuritySession(allExceptCurrent: true);
    await refreshSecurityCenter();
  }

  Future<void> resolvePending(
    PendingTransaction item,
    String action, {
    String? category,
  }) async {
    if (demoMode) {
      pendingTransactions = PendingTransactionPage(
        items: pendingTransactions.items
            .where((candidate) => candidate.id != item.id)
            .toList(),
        total: pendingTransactions.total > 0
            ? pendingTransactions.total - 1
            : 0,
        hasMore: false,
      );
      notifyListeners();
      return;
    }
    await api.resolvePendingTransaction(
      item.id,
      action: action,
      category: category,
    );
    await refresh();
  }

  Future<void> updateTransaction(
    TransactionItem item, {
    required String title,
    required double amount,
    required String type,
    required int accountId,
    required String category,
    String? mood,
  }) async {
    if (demoMode) {
      String? accountName;
      for (final account in accounts) {
        if (account.id == accountId) {
          accountName = account.name;
          break;
        }
      }
      final updated = item.copyWith(
        title: title,
        amountCents: (amount * 100).round(),
        type: type,
        accountId: accountId,
        accountName: accountName,
        category: type == '支出' ? category : item.category,
        incomeCategory: type == '收入' ? category : item.incomeCategory,
        mood: mood,
      );
      final items = transactions.items
          .map((candidate) => candidate.id == item.id ? updated : candidate)
          .toList();
      final income = items
          .where((candidate) => candidate.isIncome)
          .fold<int>(0, (sum, candidate) => sum + candidate.amountCents);
      final expense = items
          .where((candidate) => !candidate.isIncome)
          .fold<int>(0, (sum, candidate) => sum + candidate.amountCents);
      transactions = TransactionPage(
        items: items,
        total: transactions.total,
        incomeCents: income,
        expenseCents: expense,
      );
      notifyListeners();
      return;
    }
    await api.updateTransaction(
      item,
      title: title,
      amount: amount,
      type: type,
      accountId: accountId,
      category: category,
      mood: mood,
    );
    await refresh();
  }

  Future<void> saveBudget({
    required String category,
    required double amount,
  }) async {
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (category.trim().isEmpty || amount <= 0) {
      throw const ApiException('请填写分类和大于 0 的预算金额');
    }
    if (demoMode) {
      final next = CategoryBudget(
        ledgerId: ledger.id,
        category: category.trim(),
        amountCents: (amount * 100).round(),
        updatedAt: DateTime.now().toIso8601String(),
      );
      budgets = [
        ...budgets.where((item) => item.category != next.category),
        next,
      ];
      notifyListeners();
      return;
    }
    await api.saveCategoryBudget(
      ledgerId: ledger.id,
      category: category,
      amount: amount,
    );
    await refresh();
  }

  Future<void> saveAsset({
    DigitalAsset? existing,
    required String name,
    required String assetType,
    required String currency,
    required String valuationMode,
    required double manualValue,
    required double purchasePrice,
    required String purchaseDate,
    required int lifespanMonths,
    required double residualRate,
    String? heatLevel,
  }) async {
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (name.trim().isEmpty || purchasePrice <= 0) {
      throw const ApiException('请填写资产名称和大于 0 的购入原值');
    }
    if (valuationMode == '手动估值' && manualValue < 0) {
      throw const ApiException('当前估值不能小于 0');
    }
    if (demoMode) {
      final valueCents =
          ((valuationMode == '手动估值' ? manualValue : purchasePrice) * 100)
              .round();
      final next = DigitalAsset(
        id: existing?.id ?? DateTime.now().millisecondsSinceEpoch,
        name: name.trim(),
        assetType: assetType,
        currency: currency,
        valueCents: valueCents,
        purchasePriceCents: (purchasePrice * 100).round(),
        valuationMode: valuationMode,
        updatedAt: DateTime.now().toIso8601String(),
        currentValueCents: valueCents,
        purchaseDate: purchaseDate,
        lifespanMonths: lifespanMonths,
        residualRate: residualRate,
      );
      assets = [
        for (final item in assets)
          if (item.id != next.id) item,
        next,
      ];
      notifyListeners();
      return;
    }
    await api.saveAsset(
      id: existing?.id,
      ledgerId: ledger.id,
      name: name,
      assetType: assetType,
      currency: currency,
      valuationMode: valuationMode,
      manualValue: manualValue,
      purchasePrice: purchasePrice,
      purchaseDate: purchaseDate,
      lifespanMonths: lifespanMonths,
      residualRate: residualRate,
      heatLevel: heatLevel,
      expectedUpdatedAt: existing?.updatedAt,
    );
    await refresh();
  }

  Future<void> liquidateAsset({
    required DigitalAsset asset,
    required double salePrice,
    required int accountId,
  }) async {
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (!salePrice.isFinite || salePrice < 0) {
      throw const ApiException('变现金额不能小于 0');
    }
    final current = assets.where((item) => item.id == asset.id).firstOrNull;
    if (current == null) throw const ApiException('资产不存在或已经被处理');
    final cents = (salePrice * 100).round();
    Account? target;
    if (cents > 0) {
      target = accounts.where((item) => item.id == accountId).firstOrNull;
      if (target == null ||
          target.ledgerId != ledger.id ||
          target.type != '资产') {
        throw const ApiException('请选择当前账本中的资产账户');
      }
      if (target.currency != current.currency) {
        throw const ApiException('变现账户币种必须与资产一致');
      }
    }
    if (demoMode) {
      assets = assets.where((item) => item.id != current.id).toList();
      if (target != null) {
        final now = DateTime.now().toIso8601String();
        accounts = [
          for (final item in accounts)
            if (item.id == target.id)
              item.copyWith(
                balanceCents: item.balanceCents + cents,
                updatedAt: now,
              )
            else
              item,
        ];
        final transaction = TransactionItem(
          id: DateTime.now().millisecondsSinceEpoch,
          ledgerId: ledger.id,
          accountId: target.id,
          accountName: target.name,
          title: '${current.name} · 资产变现',
          amountCents: cents,
          type: '收入',
          category: '二手变现',
          occurredAt: now,
          currency: current.currency,
          source: '本机演示',
        );
        final items = [transaction, ...transactions.items];
        transactions = TransactionPage(
          items: items,
          total: items.length,
          incomeCents: transactions.incomeCents + cents,
          expenseCents: transactions.expenseCents,
        );
      }
      notifyListeners();
      return;
    }
    final expectedUpdatedAt = current.updatedAt;
    if (expectedUpdatedAt == null || expectedUpdatedAt.isEmpty) {
      throw const ApiException('资产版本信息缺失，请先刷新后重试');
    }
    await api.liquidateAsset(
      id: current.id,
      ledgerId: ledger.id,
      salePrice: salePrice,
      accountId: cents > 0 ? accountId : 0,
      expectedUpdatedAt: expectedUpdatedAt,
    );
    await refresh();
  }

  Future<void> saveSubscription({
    Subscription? existing,
    required String name,
    required double amount,
    required int accountId,
    required String cycle,
    required String category,
    required String nextChargeDate,
  }) async {
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (name.trim().isEmpty || amount <= 0 || accountId <= 0) {
      throw const ApiException('请填写订阅名称、金额并选择扣款账户');
    }
    if (!const ['每月', '每季', '每年'].contains(cycle)) {
      throw const ApiException('订阅周期无效');
    }
    if (category.trim().isEmpty || nextChargeDate.trim().isEmpty) {
      throw const ApiException('请填写分类和下次扣款日期');
    }
    final account = accounts.where((item) => item.id == accountId).firstOrNull;
    if (account == null || account.type != '资产') {
      throw const ApiException('订阅扣款账户必须是资产账户');
    }
    if (demoMode) {
      final next = Subscription(
        id: existing?.id ?? DateTime.now().millisecondsSinceEpoch,
        name: name.trim(),
        amountCents: (amount * 100).round(),
        cycle: cycle,
        accountId: accountId,
        category: category.trim(),
        nextChargeDate: nextChargeDate,
        updatedAt: DateTime.now().toIso8601String(),
      );
      subscriptions = [
        for (final item in subscriptions)
          if (item.id != next.id) item,
        next,
      ];
      notifyListeners();
      return;
    }
    await api.saveSubscription(
      id: existing?.id,
      ledgerId: ledger.id,
      name: name,
      amount: amount,
      accountId: accountId,
      cycle: cycle,
      category: category,
      nextChargeDate: nextChargeDate,
    );
    await refresh();
  }

  Future<void> deleteSubscription(Subscription item) async {
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (demoMode) {
      subscriptions = subscriptions
          .where((value) => value.id != item.id)
          .toList();
      notifyListeners();
      return;
    }
    await api.deleteSubscription(id: item.id, ledgerId: ledger.id);
    await refresh();
  }

  Future<void> createInstallment({
    required String name,
    required double totalAmount,
    required int periods,
    required double feeAmount,
    required int accountId,
    required int paymentAccountId,
    required String startMonth,
    required int chargeDay,
  }) async {
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (name.trim().isEmpty || totalAmount <= 0) {
      throw const ApiException('请填写分期名称和总金额');
    }
    if (periods < 1 || periods > 360 || feeAmount < 0) {
      throw const ApiException('期数必须在 1～360 之间，手续费不能小于 0');
    }
    if (!RegExp(r'^\d{4}-(0[1-9]|1[0-2])$').hasMatch(startMonth)) {
      throw const ApiException('开始月份格式应为 YYYY-MM');
    }
    if (chargeDay < 1 || chargeDay > 31) {
      throw const ApiException('扣款日必须在 1～31 之间');
    }
    final liability = accounts
        .where((item) => item.id == accountId)
        .firstOrNull;
    final payment = accounts
        .where((item) => item.id == paymentAccountId)
        .firstOrNull;
    if (liability == null || liability.type != '负债') {
      throw const ApiException('分期负债账户必须选择负债账户');
    }
    if (payment == null || payment.type != '资产') {
      throw const ApiException('付款账户必须选择资产账户');
    }
    if (liability.currency != payment.currency) {
      throw const ApiException('负债账户和付款账户的币种必须一致');
    }
    if (demoMode) {
      final next = Installment(
        id: DateTime.now().millisecondsSinceEpoch,
        name: name.trim(),
        totalAmountCents: (totalAmount * 100).round(),
        periods: periods,
        paidPeriods: 0,
        feeAmountCents: (feeAmount * 100).round(),
        accountId: accountId,
        paymentAccountId: paymentAccountId,
        startMonth: startMonth,
        chargeDay: chargeDay,
        updatedAt: DateTime.now().toIso8601String(),
      );
      installments = [...installments, next];
      notifyListeners();
      return;
    }
    await api.createInstallment(
      ledgerId: ledger.id,
      name: name,
      totalAmount: totalAmount,
      periods: periods,
      feeAmount: feeAmount,
      accountId: accountId,
      paymentAccountId: paymentAccountId,
      startMonth: startMonth,
      chargeDay: chargeDay,
    );
    await refresh();
  }

  Future<void> deleteInstallment(Installment item) async {
    if (demoMode) {
      installments = installments
          .where((value) => value.id != item.id)
          .toList();
      notifyListeners();
      return;
    }
    final updatedAt = item.updatedAt;
    if (updatedAt == null || updatedAt.isEmpty) {
      throw const ApiException('分期缺少版本信息，请刷新后再删除');
    }
    await api.deleteInstallment(id: item.id, expectedUpdatedAt: updatedAt);
    await refresh();
  }

  Future<void> createSavingsGoal({
    required String name,
    required double targetAmount,
    required String deadline,
    required String icon,
  }) async {
    final ledger = selectedLedger;
    if (ledger == null) throw const ApiException('没有可用的账本');
    if (name.trim().isEmpty || targetAmount <= 0 || deadline.trim().isEmpty) {
      throw const ApiException('请填写目标名称、金额和截止日期');
    }
    if (demoMode) {
      final next = SavingsGoal(
        id: DateTime.now().millisecondsSinceEpoch,
        name: name.trim(),
        targetAmountCents: (targetAmount * 100).round(),
        savedAmountCents: 0,
        deadline: deadline,
        icon: icon.trim().isEmpty ? '🌟' : icon.trim(),
        updatedAt: DateTime.now().toIso8601String(),
      );
      savingsGoals = [...savingsGoals, next];
      notifyListeners();
      return;
    }
    await api.createSavingsGoal(
      ledgerId: ledger.id,
      name: name,
      targetAmount: targetAmount,
      deadline: deadline,
      icon: icon,
    );
    await refresh();
  }

  Future<void> contributeSavingsGoal(
    SavingsGoal goal, {
    required int accountId,
    required double amount,
  }) async {
    if (amount <= 0 || accountId <= 0) {
      throw const ApiException('请选择资产账户并填写大于 0 的存入金额');
    }
    final account = accounts.where((item) => item.id == accountId).firstOrNull;
    if (account == null || account.type != '资产') {
      throw const ApiException('储蓄目标只能从资产账户存入');
    }
    if (demoMode) {
      final remaining = goal.targetAmountCents - goal.savedAmountCents;
      final applied = (amount * 100).round().clamp(0, remaining);
      if (applied <= 0) throw const ApiException('该目标已经完成');
      if (account.balanceCents < applied) throw const ApiException('资产账户余额不足');
      final updated = SavingsGoal(
        id: goal.id,
        name: goal.name,
        targetAmountCents: goal.targetAmountCents,
        savedAmountCents: goal.savedAmountCents + applied,
        deadline: goal.deadline,
        icon: goal.icon,
        updatedAt: DateTime.now().toIso8601String(),
      );
      savingsGoals = [
        for (final item in savingsGoals) item.id == goal.id ? updated : item,
      ];
      accounts = [
        for (final item in accounts)
          item.id == account.id
              ? Account(
                  id: item.id,
                  ledgerId: item.ledgerId,
                  name: item.name,
                  type: item.type,
                  balanceCents: item.balanceCents - applied,
                  currency: item.currency,
                  icon: item.icon,
                  updatedAt: item.updatedAt,
                  isInvestment: item.isInvestment,
                  assetClass: item.assetClass,
                  billDay: item.billDay,
                  repaymentDay: item.repaymentDay,
                )
              : item,
      ];
      notifyListeners();
      return;
    }
    await api.contributeSavingsGoal(
      id: goal.id,
      accountId: accountId,
      amount: amount,
    );
    await refresh();
  }

  Future<void> deleteSavingsGoal(
    SavingsGoal goal, {
    required int accountId,
  }) async {
    if (demoMode) {
      savingsGoals = savingsGoals.where((item) => item.id != goal.id).toList();
      notifyListeners();
      return;
    }
    final updatedAt = goal.updatedAt;
    if (updatedAt == null || updatedAt.isEmpty) {
      throw const ApiException('储蓄目标缺少版本信息，请刷新后再删除');
    }
    await api.deleteSavingsGoal(
      id: goal.id,
      accountId: accountId,
      expectedUpdatedAt: updatedAt,
    );
    await refresh();
  }

  Future<void> deleteTransaction(TransactionItem item) async {
    final before = transactions;
    final remaining = before.items
        .where((candidate) => candidate.id != item.id)
        .toList();
    transactions = TransactionPage(
      items: remaining,
      total: before.total > 0 ? before.total - 1 : 0,
      incomeCents: item.isIncome
          ? before.incomeCents - item.amountCents
          : before.incomeCents,
      expenseCents: item.isIncome
          ? before.expenseCents
          : before.expenseCents - item.amountCents,
    );
    notifyListeners();
    if (demoMode) return;
    try {
      await api.deleteTransaction(item);
      // The list and totals were already updated optimistically. Avoid a
      // visible full-page refresh; the normal background refresh reconciles
      // other derived panels later without interrupting the deletion motion.
    } catch (value) {
      transactions = before;
      error = '$value';
      notifyListeners();
      rethrow;
    }
  }

  Future<T?> _optional<T>(Future<T> Function() request) async {
    try {
      return await request();
    } catch (_) {
      return null;
    }
  }

  Future<void> _loadQueue() async {
    final raw = _preferences?.getStringList(_queueKey) ?? const <String>[];
    queue = raw
        .map((value) {
          try {
            return OfflineEntry.fromJson(
              jsonDecode(value) as Map<String, dynamic>,
            );
          } catch (_) {
            return null;
          }
        })
        .whereType<OfflineEntry>()
        .toList();
  }

  Future<void> _loadCoreSnapshot() async {
    final raw = _preferences?.getString(_coreSnapshotKey);
    if (raw == null || raw.isEmpty) return;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return;
      final userJson = decoded['user'];
      final ledgersJson = decoded['ledgers'];
      final accountsJson = decoded['accounts'];
      final transactionsJson = decoded['transactions'];
      final assetsJson = decoded['assets'];
      List<T> decodeList<T>(
        Object? value,
        T Function(Map<String, dynamic>) parse,
      ) {
        if (value is! List) return <T>[];
        return value
            .whereType<Map>()
            .map((item) => parse(Map<String, dynamic>.from(item)))
            .toList(growable: false);
      }

      if (userJson is Map) {
        user = SessionUser.fromJson(Map<String, dynamic>.from(userJson));
      }
      if (ledgersJson is List) {
        ledgers = ledgersJson
            .whereType<Map>()
            .map((item) => Ledger.fromJson(Map<String, dynamic>.from(item)))
            .toList(growable: false);
      }
      if (accountsJson is List) {
        accounts = accountsJson
            .whereType<Map>()
            .map((item) => Account.fromJson(Map<String, dynamic>.from(item)))
            .toList(growable: false);
      }
      if (transactionsJson is Map) {
        transactions = TransactionPage.fromJson(
          Map<String, dynamic>.from(transactionsJson),
        );
      }
      if (assetsJson is List) {
        assets = decodeList(assetsJson, DigitalAsset.fromJson);
      }
      if (decoded.containsKey('analysis')) {
        final value = decoded['analysis'];
        analysis = value is Map
            ? AnalysisSummary.fromJson(Map<String, dynamic>.from(value))
            : null;
      }
      if (decoded.containsKey('forecast')) {
        final value = decoded['forecast'];
        forecast = value is Map
            ? Forecast.fromJson(Map<String, dynamic>.from(value))
            : null;
      }
      if (decoded.containsKey('budgets')) {
        budgets = decodeList(decoded['budgets'], CategoryBudget.fromJson);
      }
      if (decoded.containsKey('subscriptions')) {
        subscriptions = decodeList(
          decoded['subscriptions'],
          Subscription.fromJson,
        );
      }
      if (decoded.containsKey('installments')) {
        installments = decodeList(
          decoded['installments'],
          Installment.fromJson,
        );
      }
      if (decoded.containsKey('savingsGoals')) {
        savingsGoals = decodeList(
          decoded['savingsGoals'],
          SavingsGoal.fromJson,
        );
      }
      if (decoded.containsKey('members')) {
        members = decodeList(decoded['members'], Member.fromJson);
      }
      if (decoded.containsKey('expenseCategories')) {
        expenseCategories = decodeList(
          decoded['expenseCategories'],
          Category.fromJson,
        );
      }
      if (decoded.containsKey('incomeCategories')) {
        incomeCategories = decodeList(
          decoded['incomeCategories'],
          Category.fromJson,
        );
      }
      final preferencesJson = decoded['preferences'];
      if (preferencesJson is Map) {
        preferences = Preferences.fromJson(
          Map<String, dynamic>.from(preferencesJson),
        );
      }
      final aiJson = decoded['lastAiReply'];
      if (aiJson is Map) {
        lastAiReply = AiReply.fromJson(Map<String, dynamic>.from(aiJson));
      }
      if (decoded.containsKey('p2pStatus')) {
        final value = decoded['p2pStatus'];
        p2pStatus = value is Map
            ? Map<String, dynamic>.from(value)
            : const <String, dynamic>{};
      }
      final exchangeRatesJson = decoded['exchangeRates'];
      if (exchangeRatesJson is Map) {
        exchangeRates = ExchangeRateSnapshot.fromJson(
          Map<String, dynamic>.from(exchangeRatesJson),
        );
      }
      if (decoded.containsKey('automationRules')) {
        automationRules = decodeList(
          decoded['automationRules'],
          AutomationRule.fromJson,
        );
      }
      final quickSyncJson = decoded['quickSyncStatus'];
      if (quickSyncJson is Map) {
        quickSyncStatus = QuickSyncStatus.fromJson(
          Map<String, dynamic>.from(quickSyncJson),
        );
      }
      if (decoded.containsKey('securitySessions')) {
        securitySessions = decodeList(
          decoded['securitySessions'],
          SecuritySession.fromJson,
        );
      }
      final securityAuditJson = decoded['securityAudit'];
      if (securityAuditJson is Map) {
        securityAudit = SecurityAuditPage.fromJson(
          Map<String, dynamic>.from(securityAuditJson),
        );
      }
      if (decoded.containsKey('notifications')) {
        notifications = decodeList(
          decoded['notifications'],
          NotificationItem.fromJson,
        );
      }
      final pendingJson = decoded['pendingTransactions'];
      if (pendingJson is Map) {
        pendingTransactions = PendingTransactionPage.fromJson(
          Map<String, dynamic>.from(pendingJson),
        );
      }
      final fireJson = decoded['fireSettings'];
      if (fireJson is Map) {
        final monthly = num.tryParse('${fireJson['monthlyExpense'] ?? ''}');
        final annual = num.tryParse('${fireJson['annualReturn'] ?? ''}');
        monthlyExpense = monthly?.toDouble();
        annualReturn = annual?.toDouble();
      }
      final economicJson = decoded['economicSettings'];
      if (economicJson is Map) {
        final inflation = num.tryParse(
          '${economicJson['inflationRate'] ?? ''}',
        );
        inflationRate = inflation?.toDouble();
      }
      final savedAt = decoded['savedAt'];
      if (savedAt is String && savedAt.isNotEmpty) cachedAt = savedAt;
      final savedIndex = decoded['selectedLedgerIndex'];
      if (savedIndex is num) selectedLedgerIndex = savedIndex.toInt();
      if (ledgers.isEmpty) {
        selectedLedgerIndex = 0;
      } else {
        selectedLedgerIndex = selectedLedgerIndex
            .clamp(0, ledgers.length - 1)
            .toInt();
      }
      notifyListeners();
    } catch (_) {
      // A stale or partially written snapshot must never prevent login.
    }
  }

  Future<void> _persistCoreSnapshot() async {
    if (_preferences == null || !authenticated || demoMode) return;
    await _preferences!.setString(
      _coreSnapshotKey,
      jsonEncode({
        'user': user?.toJson(),
        'ledgers': ledgers.map((item) => item.toJson()).toList(),
        'accounts': accounts.map((item) => item.toJson()).toList(),
        'transactions': transactions.toJson(),
        'assets': assets.map((item) => item.toJson()).toList(),
        'analysis': analysis?.toJson(),
        'forecast': forecast?.toJson(),
        'budgets': budgets.map((item) => item.toJson()).toList(),
        'subscriptions': subscriptions.map((item) => item.toJson()).toList(),
        'installments': installments.map((item) => item.toJson()).toList(),
        'savingsGoals': savingsGoals.map((item) => item.toJson()).toList(),
        'members': members.map((item) => item.toJson()).toList(),
        'expenseCategories': expenseCategories
            .map((item) => item.toJson())
            .toList(),
        'incomeCategories': incomeCategories
            .map((item) => item.toJson())
            .toList(),
        'preferences': preferences.toJson(),
        'lastAiReply': lastAiReply?.toJson(),
        'p2pStatus': p2pStatus,
        'exchangeRates': exchangeRates?.toJson(),
        'automationRules': automationRules
            .map((item) => item.toJson())
            .toList(),
        'quickSyncStatus': quickSyncStatus?.toJson(),
        'securitySessions': securitySessions
            .map((item) => item.toJson())
            .toList(),
        'securityAudit': securityAudit.toJson(),
        'notifications': notifications.map((item) => item.toJson()).toList(),
        'pendingTransactions': pendingTransactions.toJson(),
        'fireSettings': {
          if (monthlyExpense != null) 'monthlyExpense': monthlyExpense,
          if (annualReturn != null) 'annualReturn': annualReturn,
        },
        'economicSettings': {
          if (inflationRate != null) 'inflationRate': inflationRate,
        },
        'selectedLedgerIndex': selectedLedgerIndex,
        'savedAt': DateTime.now().toUtc().toIso8601String(),
      }),
    );
    cachedAt = DateTime.now().toUtc().toIso8601String();
  }

  Future<void> _persistQueue() async {
    await _preferences?.setStringList(
      _queueKey,
      queue.map((entry) => jsonEncode(entry.toJson())).toList(),
    );
  }

  @override
  void dispose() {
    _refreshOperation = null;
    super.dispose();
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final url = TextEditingController(text: 'http://localhost:3000');
  final username = TextEditingController();
  final email = TextEditingController();
  final displayName = TextEditingController();
  final password = TextEditingController();
  final passwordConfirm = TextEditingController();
  final code = TextEditingController();
  final mfa = TextEditingController();
  bool _registerMode = false;
  bool _resetMode = false;
  String? _validationError;
  Timer? _codeTimer;
  int _codeCooldown = 0;

  @override
  void dispose() {
    _codeTimer?.cancel();
    url.dispose();
    username.dispose();
    email.dispose();
    displayName.dispose();
    password.dispose();
    passwordConfirm.dispose();
    code.dispose();
    mfa.dispose();
    super.dispose();
  }

  void _setMode({bool register = false, bool reset = false}) {
    setState(() {
      _registerMode = register;
      _resetMode = reset;
      _validationError = null;
    });
    widget.controller.clearError();
  }

  void _startCodeCooldown() {
    _codeTimer?.cancel();
    setState(() => _codeCooldown = 60);
    _codeTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      if (_codeCooldown <= 1) {
        timer.cancel();
        setState(() => _codeCooldown = 0);
      } else {
        setState(() => _codeCooldown -= 1);
      }
    });
  }

  Future<void> _sendCode(String purpose) async {
    if (_codeCooldown > 0 || widget.controller.loading) return;
    final value = email.text.trim();
    if (!value.contains('@')) {
      setState(() => _validationError = '请输入有效邮箱地址');
      return;
    }
    setState(() => _validationError = null);
    await widget.controller.requestEmailCode(
      url: url.text,
      email: value,
      purpose: purpose,
    );
    if (mounted && widget.controller.error == null) _startCodeCooldown();
  }

  Future<void> _submit() async {
    setState(() => _validationError = null);
    if (_resetMode) {
      if (!email.text.trim().contains('@') || code.text.trim().isEmpty) {
        setState(() => _validationError = '请输入邮箱和验证码');
        return;
      }
      if (password.text != passwordConfirm.text) {
        setState(() => _validationError = '两次输入的密码不一致');
        return;
      }
      await widget.controller.resetPassword(
        url: url.text,
        email: email.text,
        code: code.text,
        newPassword: password.text,
      );
      if (mounted && widget.controller.error == null) _setMode();
      return;
    }
    if (_registerMode) {
      if (password.text != passwordConfirm.text) {
        setState(() => _validationError = '两次输入的密码不一致');
        return;
      }
      await widget.controller.register(
        url: url.text,
        username: username.text,
        email: email.text,
        displayName: displayName.text,
        password: password.text,
        code: code.text,
      );
      return;
    }
    await widget.controller.login(
      url: url.text,
      username: username.text,
      password: password.text,
      mfaCode: mfa.text,
    );
  }

  Widget _codeField(String purpose) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: TextField(
            controller: code,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: '邮箱验证码'),
          ),
        ),
        const SizedBox(width: 10),
        SizedBox(
          height: 56,
          child: OutlinedButton(
            onPressed: widget.controller.loading || _codeCooldown > 0
                ? null
                : () => _sendCode(purpose),
            child: Text(_codeCooldown > 0 ? '${_codeCooldown}s' : '发送验证码'),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 640;
    final error = _validationError ?? widget.controller.error;
    final title = _resetMode
        ? '找回密码'
        : _registerMode
        ? '创建账号'
        : '登录账号';
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Card(
              child: Padding(
                padding: EdgeInsets.all(wide ? 36 : 22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Neo Ledger',
                      style: TextStyle(
                        fontSize: 34,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '统一账本客户端',
                      style: TextStyle(
                        color: Colors.grey.shade400,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 28),
                    TextField(
                      controller: url,
                      keyboardType: TextInputType.url,
                      decoration: const InputDecoration(
                        labelText: '服务地址',
                        hintText: 'http://电脑IP:3000 或 NAS HTTPS 地址',
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 14),
                    if (!_resetMode)
                      SegmentedButton<bool>(
                        segments: const [
                          ButtonSegment(value: false, label: Text('登录')),
                          ButtonSegment(value: true, label: Text('注册')),
                        ],
                        selected: {_registerMode},
                        onSelectionChanged: (values) =>
                            _setMode(register: values.first),
                      ),
                    if (!_resetMode) const SizedBox(height: 14),
                    if (_registerMode && !_resetMode) ...[
                      TextField(
                        controller: displayName,
                        decoration: const InputDecoration(labelText: '显示名称'),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (!_resetMode) ...[
                      TextField(
                        controller: username,
                        decoration: InputDecoration(
                          labelText: _registerMode ? '账号' : '用户名或邮箱',
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (_registerMode || _resetMode) ...[
                      TextField(
                        controller: email,
                        keyboardType: TextInputType.emailAddress,
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          labelText: _registerMode ? '邮箱（选填）' : '注册邮箱',
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (_registerMode && email.text.trim().isNotEmpty) ...[
                      _codeField('register'),
                      const SizedBox(height: 12),
                    ],
                    if (_resetMode) ...[
                      _codeField('reset'),
                      const SizedBox(height: 12),
                    ],
                    TextField(
                      controller: password,
                      obscureText: true,
                      decoration: InputDecoration(
                        labelText: _resetMode ? '新密码' : '密码',
                      ),
                    ),
                    if (_registerMode || _resetMode) ...[
                      const SizedBox(height: 12),
                      TextField(
                        controller: passwordConfirm,
                        obscureText: true,
                        decoration: const InputDecoration(labelText: '确认密码'),
                      ),
                    ],
                    if (!_registerMode && !_resetMode) ...[
                      const SizedBox(height: 12),
                      TextField(
                        controller: mfa,
                        decoration: const InputDecoration(
                          labelText: 'MFA 验证码（可选）',
                        ),
                      ),
                    ],
                    if (error != null) ...[
                      const SizedBox(height: 16),
                      Text(
                        error,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: widget.controller.loading ? null : _submit,
                      child: Text(
                        widget.controller.loading
                            ? '处理中…'
                            : _resetMode
                            ? '重置密码'
                            : _registerMode
                            ? '创建账号并同步'
                            : '登录并同步',
                      ),
                    ),
                    if (!_resetMode && !_registerMode) ...[
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: widget.controller.loading
                            ? null
                            : () => _setMode(reset: true),
                        child: const Text('忘记密码？'),
                      ),
                    ],
                    if (_resetMode) ...[
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: widget.controller.loading ? null : _setMode,
                        child: const Text('返回登录'),
                      ),
                    ],
                    if (!_resetMode) const SizedBox(height: 10),
                    if (!_resetMode)
                      OutlinedButton(
                        onPressed: widget.controller.loading
                            ? null
                            : widget.controller.loadDemo,
                        child: const Text('进入本地演示模式'),
                      ),
                    const SizedBox(height: 18),
                    Text(
                      '原生客户端与网页端共用同一个账本服务。电脑可填 localhost；手机/平板请填写电脑或 NAS 地址，公网部署请使用 HTTPS。',
                      style: TextStyle(
                        color: Colors.grey.shade500,
                        height: 1.45,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class NeoShell extends StatefulWidget {
  const NeoShell({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<NeoShell> createState() => _NeoShellState();
}

class _NeoShellState extends State<NeoShell> with WidgetsBindingObserver {
  int tab = 0;
  int? _selectedTransactionId;
  static const titles = ['主页', '资产', '账单', '规划', '分析'];
  final updateService = NeoLedgerUpdateService();
  final _billSearchController = TextEditingController();
  String _billQuery = '';
  String _billType = '全部';
  Timer? _backgroundRefreshTimer;
  AppLifecycleState _lifecycleState = AppLifecycleState.resumed;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _backgroundRefreshTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _refreshInBackground(),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _lifecycleState = state;
    if (state == AppLifecycleState.resumed) _refreshInBackground();
  }

  void _refreshInBackground() {
    if (!mounted ||
        _lifecycleState != AppLifecycleState.resumed ||
        widget.controller.demoMode ||
        !widget.controller.authenticated ||
        widget.controller.loading) {
      return;
    }
    unawaited(_refreshSilently());
  }

  Future<void> _refreshSilently() async {
    try {
      if (widget.controller.queue.isNotEmpty) {
        await widget.controller.syncQueue(silent: true);
      } else {
        await widget.controller.refresh(silent: true);
      }
    } catch (_) {
      // A failed sync remains queued; still try to refresh server-side data.
      try {
        await widget.controller.refresh(silent: true);
      } catch (_) {
        // Background work must not interrupt the current page or show a toast.
      }
    }
  }

  @override
  void dispose() {
    _backgroundRefreshTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _billSearchController.dispose();
    updateService.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final mobile = width < 640;
    final content = _page(context);
    if (mobile) {
      return Scaffold(
        appBar: AppBar(
          title: Text(titles[tab]),
          actions: [
            _updateButton(),
            _notificationButton(),
            _pendingButton(),
            _ledgerMenu(),
            IconButton(
              onPressed: widget.controller.logout,
              icon: const Icon(Icons.logout),
            ),
          ],
        ),
        body: content,
        floatingActionButton: FloatingActionButton(
          onPressed: _openEntry,
          backgroundColor: _brand,
          foregroundColor: Colors.black,
          child: const Icon(Icons.add),
        ),
        floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
        bottomNavigationBar: NavigationBar(
          selectedIndex: tab,
          onDestinationSelected: (value) => setState(() => tab = value),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home),
              label: '主页',
            ),
            NavigationDestination(
              icon: Icon(Icons.account_balance_wallet_outlined),
              label: '资产',
            ),
            NavigationDestination(
              icon: Icon(Icons.receipt_long_outlined),
              label: '账单',
            ),
            NavigationDestination(
              icon: Icon(Icons.event_note_outlined),
              label: '规划',
            ),
            NavigationDestination(
              icon: Icon(Icons.bar_chart_outlined),
              label: '分析',
            ),
          ],
        ),
      );
    }
    final extended = width >= 1181;
    return Scaffold(
      body: Row(
        children: [
          NavigationRail(
            extended: extended,
            selectedIndex: tab,
            onDestinationSelected: (value) => setState(() => tab = value),
            leading: Padding(
              padding: const EdgeInsets.symmetric(vertical: 18),
              child: Text(
                'N',
                style: TextStyle(
                  color: _brand,
                  fontSize: extended ? 30 : 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            destinations: const [
              NavigationRailDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home),
                label: Text('主页'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.account_balance_wallet_outlined),
                label: Text('资产'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.receipt_long_outlined),
                label: Text('账单'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.event_note_outlined),
                label: Text('规划'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.bar_chart_outlined),
                label: Text('分析'),
              ),
            ],
          ),
          Expanded(
            child: Scaffold(
              appBar: AppBar(
                title: Text(titles[tab]),
                actions: [
                  _updateButton(),
                  _notificationButton(),
                  _pendingButton(),
                  _ledgerMenu(),
                  IconButton(
                    onPressed: widget.controller.logout,
                    icon: const Icon(Icons.logout),
                  ),
                ],
              ),
              body: _responsiveContent(context, content),
              floatingActionButton: FloatingActionButton.extended(
                onPressed: _openEntry,
                backgroundColor: _brand,
                foregroundColor: Colors.black,
                icon: const Icon(Icons.add),
                label: const Text('记一笔'),
              ),
            ),
          ),
        ],
      ),
    );
  }

  TransactionItem? _selectedTransaction() {
    final items = widget.controller.transactions.items;
    final selectedId = _selectedTransactionId;
    if (selectedId != null) {
      for (final item in items) {
        if (item.id == selectedId) return item;
      }
    }
    return items.isEmpty ? null : items.first;
  }

  void _selectTransaction(TransactionItem item) {
    if (_selectedTransactionId == item.id) return;
    setState(() => _selectedTransactionId = item.id);
  }

  Widget _responsiveContent(BuildContext context, Widget content) {
    final width = MediaQuery.sizeOf(context).width;
    final useMasterDetail = width >= 900 && width < 1181;
    // The detail pane belongs to the home/bills workflows. Applying it to
    // settings or analytics creates a misleading empty transaction detail.
    if (!useMasterDetail || (tab != 0 && tab != 2)) return content;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(child: content),
        const VerticalDivider(width: 1),
        SizedBox(width: 360, child: _tabletDetails()),
      ],
    );
  }

  Widget _tabletDetails() {
    final item = _selectedTransaction();
    final theme = Theme.of(context);

    Widget detailLine(String label, String value) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 82,
              child: Text(label, style: theme.textTheme.bodySmall),
            ),
            Expanded(
              child: Text(
                value,
                textAlign: TextAlign.end,
                style: theme.textTheme.bodyMedium,
              ),
            ),
          ],
        ),
      );
    }

    return ColoredBox(
      color: theme.scaffoldBackgroundColor,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 100),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('流水详情', style: theme.textTheme.titleLarge),
            const SizedBox(height: 12),
            if (item == null)
              const _EmptyState(message: '选择一笔流水查看详情')
            else ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item.title, style: theme.textTheme.titleMedium),
                      const SizedBox(height: 8),
                      Text(
                        '${item.isIncome ? '+' : '-'}${_money(item.amountCents)}',
                        style: theme.textTheme.headlineSmall?.copyWith(
                          color: item.isIncome ? Colors.green : _brand,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(item.isIncome ? '收入' : '支出'),
                    ],
                  ),
                ),
              ),
              Card(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                  child: Column(
                    children: [
                      detailLine('发生时间', _date(item.occurredAt)),
                      detailLine('来源', item.source),
                      detailLine('账户', item.accountName ?? '未指定账户'),
                      detailLine('分类', item.category ?? '未分类'),
                      detailLine('币种', item.currency),
                      if (item.updatedAt != null)
                        detailLine('更新时间', _date(item.updatedAt!)),
                    ],
                  ),
                ),
              ),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _editTransaction(item),
                      icon: const Icon(Icons.edit_outlined),
                      label: const Text('编辑'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: item.installmentId == null
                          ? () => _deleteTransaction(item)
                          : null,
                      icon: const Icon(Icons.delete_outline),
                      label: const Text('删除'),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 18),
            Text('本月概览', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: [
                  _SettingRow(
                    label: '本月支出',
                    value: _moneyYuan(widget.controller.monthlyExpense),
                  ),
                  _SettingRow(
                    label: '待同步',
                    value: '${widget.controller.totalPendingCount} 笔',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _ledgerMenu() {
    return PopupMenuButton<int>(
      tooltip: '切换账本',
      icon: const Icon(Icons.menu_book_outlined),
      onSelected: (value) {
        if (value >= 0) {
          widget.controller.selectLedger(value);
        } else if (value == -1) {
          _openLedger();
        } else if (value == -2) {
          final current = widget.controller.selectedLedger;
          if (current != null) _openLedger(current);
        } else if (value == -3) {
          _openSettings();
        } else if (value == -4) {
          _openDataCenter();
        }
      },
      itemBuilder: (context) => [
        for (var i = 0; i < widget.controller.ledgers.length; i++)
          PopupMenuItem(
            value: i,
            child: Text(
              '${widget.controller.ledgers[i].icon} ${widget.controller.ledgers[i].name}',
            ),
          ),
        if (widget.controller.ledgers.isNotEmpty) const PopupMenuDivider(),
        const PopupMenuItem(value: -1, child: Text('新建账本')),
        if (widget.controller.selectedLedger != null)
          const PopupMenuItem(value: -2, child: Text('管理当前账本')),
        const PopupMenuItem(value: -3, child: Text('连接与设置')),
        const PopupMenuItem(value: -4, child: Text('数据中心（备份与恢复）')),
      ],
    );
  }

  Widget _updateButton() => IconButton(
    tooltip: '检查更新',
    onPressed: _checkForUpdate,
    icon: const Icon(Icons.system_update_alt_outlined),
  );

  Widget _notificationButton() {
    final count = widget.controller.unreadNotificationCount;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          tooltip: '通知中心',
          onPressed: _openNotifications,
          icon: const Icon(Icons.notifications_none_outlined),
        ),
        if (count > 0)
          Positioned(right: 6, top: 5, child: _CountBadge(count: count)),
      ],
    );
  }

  Widget _pendingButton() {
    final count = widget.controller.totalPendingCount;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          tooltip: '待处理账单',
          onPressed: _openPending,
          icon: const Icon(Icons.fact_check_outlined),
        ),
        if (count > 0)
          Positioned(right: 6, top: 5, child: _CountBadge(count: count)),
      ],
    );
  }

  Future<void> _checkForUpdate() async {
    try {
      final latest = await updateService.checkLatest();
      if (!mounted) return;
      if (latest == null || !latest.isNewerThan(_nativeVersion)) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('当前已经是最新版本（仅检查 native-v* 原生客户端发布）')),
        );
        return;
      }
      final platform = _platformName();
      final asset = latest.assetFor(platform);
      final assetName = latest.assetNameFor(platform);
      final canInstallAndroid =
          platform == 'android' &&
          asset != null &&
          assetName != null &&
          assetName.toLowerCase().endsWith('.apk');
      final iosNeedsAppleDistribution =
          platform == 'ios' &&
          (asset == null ||
              (assetName?.toLowerCase().contains('unsigned') ?? false));
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text('发现新版本 v${latest.version}'),
          content: SingleChildScrollView(
            child: Text(
              '${latest.notes.isEmpty ? '该版本包含功能和稳定性改进。' : latest.notes}\n\n当前平台：$platform\n${iosNeedsAppleDistribution
                  ? 'iOS/iPadOS 需要通过 TestFlight 或 App Store 安装，不能直接安装未签名 ZIP。'
                  : asset == null
                  ? '请打开发布页选择对应安装包。'
                  : canInstallAndroid
                  ? '已找到 Android APK，可在应用内下载、校验并交给系统安装。'
                  : '已找到当前平台安装包。'}',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('稍后'),
            ),
            FilledButton(
              onPressed: () async {
                Navigator.pop(dialogContext);
                if (canInstallAndroid) {
                  await _installAndroidUpdate(latest, asset, assetName);
                  return;
                }
                final uri = Uri.tryParse(
                  iosNeedsAppleDistribution
                      ? latest.releaseUrl
                      : asset ?? latest.releaseUrl,
                );
                if (uri != null) {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                }
              },
              child: Text(
                canInstallAndroid
                    ? '下载并安装'
                    : iosNeedsAppleDistribution
                    ? '打开发布页'
                    : '打开下载页',
              ),
            ),
          ],
        ),
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('检查更新失败：$error')));
      }
    }
  }

  Future<void> _installAndroidUpdate(
    UpdateInfo latest,
    String apkUrl,
    String apkName,
  ) async {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('正在下载更新，完成后将弹出系统安装确认…')));
    try {
      final result = await widget.controller.installAndroidUpdate(
        version: latest.version,
        apkUrl: apkUrl,
        apkName: apkName,
        checksumUrl: latest.checksumManifestUrl,
      );
      if (!mounted) return;
      final message = '${result['message'] ?? '更新处理完成'}';
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('更新失败：$error')));
      }
    }
  }

  String _platformName() {
    if (kIsWeb) return 'web';
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'android',
      TargetPlatform.iOS => 'ios',
      TargetPlatform.windows => 'windows',
      TargetPlatform.macOS => 'macos',
      _ => 'other',
    };
  }

  Widget _page(BuildContext context) {
    final controller = widget.controller;
    return RefreshIndicator(
      onRefresh: () async {
        try {
          await controller.refresh();
        } catch (_) {}
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 100),
        children: [
          if (controller.pendingCount > 0) _QueueBanner(controller: controller),
          if (controller.pendingServerCount > 0)
            _ServerPendingBanner(controller: controller, onTap: _openPending),
          if (controller.unreadNotificationCount > 0)
            _NotificationBanner(
              controller: controller,
              onTap: _openNotifications,
            ),
          if (controller.error != null)
            _ErrorBanner(message: controller.error!),
          if (tab == 0) _home(context),
          if (tab == 1) _assets(),
          if (tab == 2) _bills(),
          if (tab == 3) _plans(),
          if (tab == 4) _analysis(),
        ],
      ),
    );
  }

  Widget _home(BuildContext context) {
    final page = widget.controller.transactions;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '今晚，先抱抱真实生活的自己',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 10),
                Text(
                  '账本会记录成本，也帮你看见下一步。',
                  style: TextStyle(color: Colors.grey.shade400),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        LayoutBuilder(
          builder: (context, constraints) {
            final columns = constraints.maxWidth >= 900 ? 3 : 1;
            return GridView.count(
              crossAxisCount: columns,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: columns == 1 ? 3.8 : 2.2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                _Metric(
                  label: '收入',
                  value: _money(page.incomeCents),
                  color: _brand,
                ),
                _Metric(
                  label: '支出',
                  value: _money(page.expenseCents),
                  color: Colors.white,
                ),
                _Metric(
                  label: '结余',
                  value: _money(page.balanceCents),
                  color: page.balanceCents >= 0 ? _brand : Colors.orangeAccent,
                ),
              ],
            );
          },
        ),
        const SizedBox(height: 20),
        _sectionTitle('最近流水', onAction: () => setState(() => tab = 2)),
        const SizedBox(height: 10),
        _transactionList(page.items.take(5).toList()),
      ],
    );
  }

  Widget _assets() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sectionTitle(
          '账户资产',
          onAction: () => _openAccount(),
          actionLabel: '新增账户',
        ),
        const SizedBox(height: 12),
        if (widget.controller.accounts.isEmpty)
          const _EmptyState(message: '暂无账户，点击右上角新增账户'),
        ...widget.controller.accounts.map(
          (account) => Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              onTap: () => _openAccount(account),
              leading: Text(account.icon, style: const TextStyle(fontSize: 28)),
              title: Text(account.name),
              subtitle: Text(
                '${account.type} · ${account.assetClass} · ${account.currency}\n余额 ${_money(account.balanceCents)}',
              ),
              isThreeLine: true,
              trailing: PopupMenuButton<String>(
                tooltip: '账户操作',
                onSelected: (value) {
                  if (value == 'edit') {
                    _openAccount(account);
                  } else if (value == 'delete') {
                    _deleteAccount(account);
                  } else if (value == 'transfer') {
                    _openTransfer(initialFrom: account);
                  }
                },
                itemBuilder: (context) => const [
                  PopupMenuItem(value: 'edit', child: Text('编辑账户')),
                  PopupMenuItem(value: 'transfer', child: Text('转账/还款')),
                  PopupMenuItem(value: 'delete', child: Text('删除账户')),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 18),
        _sectionTitle(
          '数字资产',
          onAction: () => _openAsset(),
          actionLabel: '新增资产',
        ),
        const SizedBox(height: 12),
        if (widget.controller.assets.isEmpty)
          const _EmptyState(message: '暂无数字资产，点击右上角新增'),
        ...widget.controller.assets.map(
          (asset) => Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              onTap: () => _openAsset(asset),
              leading: const Icon(Icons.category_outlined),
              title: Text(asset.name),
              subtitle: Text(
                '${asset.assetType} · ${asset.valuationMode ?? '手动估值'} · ${asset.currency}',
              ),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _money(asset.currentValueCents ?? asset.valueCents),
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  PopupMenuButton<String>(
                    tooltip: '资产操作',
                    onSelected: (value) {
                      if (value == 'edit') _openAsset(asset);
                      if (value == 'liquidate') _openLiquidation(asset);
                    },
                    itemBuilder: (context) => const [
                      PopupMenuItem(value: 'edit', child: Text('编辑资产')),
                      PopupMenuItem(value: 'liquidate', child: Text('变现/注销')),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
        if (widget.controller.accounts.isEmpty &&
            widget.controller.assets.isEmpty)
          const _EmptyState(message: '暂无资产数据'),
      ],
    );
  }

  Widget _bills() {
    final allItems = widget.controller.transactions.items;
    final query = _billQuery.trim().toLowerCase();
    final items = allItems.where((item) {
      if (_billType != '全部' && item.type != _billType) return false;
      if (query.isEmpty) return true;
      final searchable = [
        item.title,
        item.category,
        item.incomeCategory,
        item.accountName,
        item.source,
        item.type,
        _money(item.amountCents),
      ].whereType<String>().join(' ').toLowerCase();
      return searchable.contains(query);
    }).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sectionTitle('账单明细'),
        const SizedBox(height: 12),
        TextField(
          controller: _billSearchController,
          onChanged: (value) => setState(() => _billQuery = value),
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search),
            hintText: '搜索项目、分类、账户、来源或金额',
            suffixIcon: _billQuery.isEmpty
                ? null
                : IconButton(
                    tooltip: '清除搜索',
                    onPressed: () {
                      _billSearchController.clear();
                      setState(() => _billQuery = '');
                    },
                    icon: const Icon(Icons.clear),
                  ),
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          children: [
            for (final type in const ['全部', '收入', '支出'])
              FilterChip(
                label: Text(type),
                selected: _billType == type,
                onSelected: (_) => setState(() => _billType = type),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          '显示 ${items.length} / ${allItems.length} 条流水',
          style: TextStyle(color: Colors.grey.shade400, fontSize: 12),
        ),
        const SizedBox(height: 10),
        _transactionList(items),
      ],
    );
  }

  Widget _plans() {
    final controller = widget.controller;
    final forecast = controller.forecast;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sectionTitle(
          '规划与现金流',
          onAction: () => _openBudget(),
          actionLabel: '新增预算',
        ),
        const SizedBox(height: 12),
        if (controller.budgets.isEmpty)
          const _EmptyState(message: '暂无分类预算，点击右上角新增')
        else ...[
          ...controller.budgets.map((budget) {
            final spent = _categorySpent(budget.category);
            final ratio = budget.amountCents <= 0
                ? 0.0
                : (spent / budget.amountCents).clamp(0.0, 1.0).toDouble();
            return Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          budget.category,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const Spacer(),
                        Text(
                          '${_money(spent)} / ${_money(budget.amountCents)}',
                        ),
                        IconButton(
                          tooltip: '编辑预算',
                          onPressed: () => _openBudget(existing: budget),
                          icon: const Icon(Icons.edit_outlined),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    LinearProgressIndicator(
                      value: ratio,
                      minHeight: 8,
                      borderRadius: BorderRadius.circular(8),
                      color: ratio >= .9 ? Colors.orangeAccent : _brand,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '已使用 ${(ratio * 100).round()}% · 数据来自当前账本月度汇总',
                      style: TextStyle(
                        color: Colors.grey.shade400,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
        ],
        const SizedBox(height: 16),
        _sectionTitle(
          '固定订阅',
          onAction: () => _openSubscription(),
          actionLabel: '新增订阅',
        ),
        const SizedBox(height: 10),
        if (controller.subscriptions.isEmpty)
          const _EmptyState(message: '暂无固定订阅')
        else ...[
          for (final item in controller.subscriptions)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: const Icon(Icons.autorenew),
                title: Text(item.name),
                subtitle: Text(
                  '${item.cycle} · ${item.category ?? '未分类'}${item.nextChargeDate == null ? '' : ' · 下次 ${item.nextChargeDate}'}',
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _money(item.amountCents),
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    PopupMenuButton<String>(
                      tooltip: '订阅操作',
                      onSelected: (value) {
                        if (value == 'edit') {
                          _openSubscription(item);
                        } else if (value == 'delete') {
                          _deleteSubscription(item);
                        }
                      },
                      itemBuilder: (context) => const [
                        PopupMenuItem(value: 'edit', child: Text('编辑订阅')),
                        PopupMenuItem(value: 'delete', child: Text('删除订阅')),
                      ],
                    ),
                  ],
                ),
              ),
            ),
        ],
        const SizedBox(height: 16),
        _sectionTitle(
          '分期与储蓄目标',
          onAction: _openPlanningActions,
          actionLabel: '新增',
        ),
        const SizedBox(height: 10),
        if (controller.installments.isEmpty && controller.savingsGoals.isEmpty)
          const _EmptyState(message: '暂无分期或储蓄目标')
        else ...[
          for (final item in controller.installments)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: const Icon(Icons.payments_outlined),
                title: Text(item.name),
                subtitle: Text('剩余 ${item.remainingPeriods}/${item.periods} 期'),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _money(item.totalAmountCents),
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    PopupMenuButton<String>(
                      tooltip: '分期操作',
                      onSelected: (value) {
                        if (value == 'delete') _deleteInstallment(item);
                      },
                      itemBuilder: (context) => const [
                        PopupMenuItem(value: 'delete', child: Text('删除分期')),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          for (final goal in controller.savingsGoals)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text('${goal.icon ?? '🎯'} ${goal.name}'),
                        ),
                        Text(
                          '${_money(goal.savedAmountCents)} / ${_money(goal.targetAmountCents)}',
                        ),
                        IconButton(
                          tooltip: '管理储蓄目标',
                          onPressed: () => _openGoal(goal),
                          icon: const Icon(Icons.more_horiz),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    LinearProgressIndicator(
                      value: goal.progress,
                      minHeight: 8,
                      borderRadius: BorderRadius.circular(8),
                      color: _brand,
                    ),
                    if (goal.deadline != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        '目标日期：${goal.deadline}',
                        style: TextStyle(
                          color: Colors.grey.shade400,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
        ],
        if (forecast != null) ...[
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '现金流预测',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 18,
                    runSpacing: 10,
                    children: [
                      Text('净资产 ${_money(forecast.netWorthCents)}'),
                      Text('日均支出 ${_money(forecast.averageDailySpendCents)}'),
                      Text('可支撑 ${forecast.runwayDays} 天'),
                    ],
                  ),
                  if (forecast.bankruptcyDate != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      '预计现金流风险日：${forecast.bankruptcyDate}',
                      style: const TextStyle(color: Colors.orangeAccent),
                    ),
                  ],
                  if (!forecast.hasSpendingData) ...[
                    const SizedBox(height: 8),
                    Text(
                      '当前样本不足，预测仅供参考',
                      style: TextStyle(color: Colors.grey.shade400),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),
        _sectionTitle('账单与财务工具'),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: _openImport,
              icon: const Icon(Icons.upload_file),
              label: const Text('导入账单'),
            ),
            OutlinedButton.icon(
              onPressed: _openSettlement,
              icon: const Icon(Icons.handshake_outlined),
              label: const Text('分账/结算'),
            ),
            OutlinedButton.icon(
              onPressed: _openFinanceSettings,
              icon: const Icon(Icons.tune),
              label: const Text('FIRE 与通胀参数'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _analysis() {
    final summary = widget.controller.analysis;
    if (summary == null) {
      return const _EmptyState(message: '暂时无法读取分析数据，请下拉刷新或检查服务地址');
    }
    final categories = summary.categoryData
        .where((item) => item.amountCents > 0)
        .take(8)
        .toList();
    final incomes = summary.incomeData
        .where((item) => item.amountCents > 0)
        .take(6)
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _sectionTitle('本月分析'),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            final columns = constraints.maxWidth >= 900 ? 3 : 1;
            return GridView.count(
              crossAxisCount: columns,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: columns == 1 ? 3.8 : 2.2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                _Metric(
                  label: '收入',
                  value: _money(summary.incomeCents),
                  color: _brand,
                ),
                _Metric(
                  label: '支出',
                  value: _money(summary.expenseCents),
                  color: Colors.white,
                ),
                _Metric(
                  label: '储蓄率',
                  value: '${summary.savingRate.toStringAsFixed(1)}%',
                  color: summary.savingRate >= 0 ? _brand : Colors.orangeAccent,
                ),
              ],
            );
          },
        ),
        const SizedBox(height: 16),
        if (summary.topCategory != null)
          Card(
            child: ListTile(
              leading: const Icon(
                Icons.local_fire_department,
                color: Colors.orangeAccent,
              ),
              title: Text('最高支出分类：${summary.topCategory!.name}'),
              trailing: Text(_money(summary.topCategory!.amountCents)),
            ),
          ),
        const SizedBox(height: 12),
        _barSection('支出分类', categories, color: Colors.orangeAccent),
        const SizedBox(height: 12),
        _barSection('收入来源', incomes, color: _brand),
        if (summary.trend.isNotEmpty) ...[
          const SizedBox(height: 12),
          _trendSection(summary.trend),
        ],
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Wrap(
              spacing: 18,
              runSpacing: 12,
              children: [
                Text('刚需支出 ${_money(summary.needExpenseCents)}'),
                Text('冲动支出 ${_money(summary.impulseCents)}'),
                Text('投资收入 ${_money(summary.investmentIncomeCents)}'),
              ],
            ),
          ),
        ),
      ],
    );
  }

  int _categorySpent(String category) {
    for (final bucket
        in widget.controller.analysis?.categoryData ??
            const <AnalysisBucket>[]) {
      if (bucket.name == category) return bucket.amountCents;
    }
    return 0;
  }

  Widget _barSection(
    String title,
    List<AnalysisBucket> buckets, {
    required Color color,
  }) {
    if (buckets.isEmpty) return _EmptyState(message: '$title暂无数据');
    final maxAmount = buckets.fold<int>(
      1,
      (current, item) =>
          item.amountCents > current ? item.amountCents : current,
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
            ),
            const SizedBox(height: 12),
            ...buckets.map((item) {
              final ratio = (item.amountCents / maxAmount)
                  .clamp(0.0, 1.0)
                  .toDouble();
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(item.name),
                        const Spacer(),
                        Text(_money(item.amountCents)),
                      ],
                    ),
                    const SizedBox(height: 5),
                    LinearProgressIndicator(
                      value: ratio,
                      minHeight: 7,
                      borderRadius: BorderRadius.circular(7),
                      color: color,
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  Widget _trendSection(List<AnalysisTrendPoint> points) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '收支趋势',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
            ),
            const SizedBox(height: 12),
            ...points
                .take(8)
                .map(
                  (point) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(point.label),
                    subtitle: Text(
                      '收入 ${_money(point.incomeCents)} · 支出 ${_money(point.expenseCents)}',
                    ),
                    trailing: Icon(
                      point.incomeCents >= point.expenseCents
                          ? Icons.trending_up
                          : Icons.trending_down,
                      color: point.incomeCents >= point.expenseCents
                          ? _brand
                          : Colors.orangeAccent,
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }

  Widget _transactionList(List<TransactionItem> items) {
    if (items.isEmpty) return const _EmptyState(message: '还没有流水，点击“记一笔”开始');
    return Column(
      children: items.map((item) {
        final selected = _selectedTransactionId == item.id;
        return Card(
          margin: const EdgeInsets.only(bottom: 10),
          color: selected ? _brand.withValues(alpha: .12) : null,
          child: ListTile(
            selected: selected,
            onTap: () => _selectTransaction(item),
            leading: CircleAvatar(
              backgroundColor: item.isIncome
                  ? Colors.green.withValues(alpha: .18)
                  : Colors.orange.withValues(alpha: .18),
              child: Icon(
                item.isIncome ? Icons.south_west : Icons.north_east,
                color: item.isIncome ? _brand : Colors.orangeAccent,
              ),
            ),
            title: Text(item.title),
            subtitle: Text(
              '${item.category ?? '未分类'} · ${item.accountName ?? item.source} · ${_date(item.occurredAt)}',
            ),
            trailing: SizedBox(
              width: 190,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Flexible(
                    child: Text(
                      '${item.isIncome ? '+' : '-'}${_money(item.amountCents)}',
                      textAlign: TextAlign.end,
                      style: TextStyle(
                        color: item.isIncome ? _brand : Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  PopupMenuButton<String>(
                    tooltip: '流水操作',
                    onSelected: (value) {
                      if (value == 'edit') {
                        _editTransaction(item);
                      } else if (value == 'delete') {
                        _deleteTransaction(item);
                      }
                    },
                    itemBuilder: (context) => [
                      const PopupMenuItem(value: 'edit', child: Text('编辑流水')),
                      PopupMenuItem(
                        value: 'delete',
                        enabled: item.installmentId == null,
                        child: Text(
                          item.installmentId == null ? '删除流水' : '分期流水不可单独删除',
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _sectionTitle(
    String title, {
    VoidCallback? onAction,
    String actionLabel = '查看全部',
  }) {
    return Row(
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
        ),
        const Spacer(),
        if (onAction != null)
          TextButton(onPressed: onAction, child: Text(actionLabel)),
      ],
    );
  }

  Future<void> _openEntry() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => EntrySheet(controller: widget.controller),
    );
  }

  Future<void> _openNotifications() async {
    try {
      await widget.controller.markNotificationsRead();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('通知同步失败：$error')));
      }
    }
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => NotificationSheet(items: widget.controller.notifications),
    );
  }

  Future<void> _openPending() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => PendingSheet(controller: widget.controller),
    );
  }

  Future<void> _openBudget({CategoryBudget? existing}) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          BudgetSheet(controller: widget.controller, existing: existing),
    );
  }

  Future<void> _openImport() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => ImportSheet(controller: widget.controller),
    );
  }

  Future<void> _openSettlement() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => SettlementSheet(controller: widget.controller),
    );
  }

  Future<void> _openFinanceSettings() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => FinanceSettingsSheet(controller: widget.controller),
    );
  }

  Future<void> _openAsset([DigitalAsset? existing]) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          AssetSheet(controller: widget.controller, existing: existing),
    );
  }

  Future<void> _openLiquidation(DigitalAsset asset) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          AssetLiquidationSheet(controller: widget.controller, asset: asset),
    );
  }

  Future<void> _openLedger([Ledger? existing]) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => LedgerSheet(
        controller: widget.controller,
        existing: existing,
        onDelete: existing == null ? null : () => _deleteLedger(existing),
      ),
    );
  }

  Future<void> _openAccount([Account? existing]) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => AccountSheet(
        controller: widget.controller,
        existing: existing,
        onDelete: existing == null ? null : () => _deleteAccount(existing),
      ),
    );
  }

  Future<void> _openTransfer({Account? initialFrom}) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => TransferSheet(
        controller: widget.controller,
        initialFrom: initialFrom,
      ),
    );
  }

  Future<void> _openSettings() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => SettingsSheet(controller: widget.controller),
    );
  }

  Future<void> _openDataCenter() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => DataCenterSheet(controller: widget.controller),
    );
  }

  Future<void> _deleteLedger(Ledger item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除账本？'),
        content: Text('“${item.name}”及其账单、账户和规划数据将一起删除。此操作不可撤销。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.controller.deleteLedger(item);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('账本已删除')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('删除账本失败：$error')));
      }
    }
  }

  Future<void> _deleteAccount(Account item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除账户？'),
        content: Text('删除“${item.name}”。如果账户已经被流水、分期或转账引用，需要先处理这些记录。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.controller.deleteAccount(item);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('账户已删除')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('删除账户失败：$error')));
      }
    }
  }

  Future<void> _openPlanningActions() async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.autorenew),
              title: const Text('新增固定订阅'),
              subtitle: const Text('按月、按季或按年生成规划提醒'),
              onTap: () {
                Navigator.pop(sheetContext);
                _openSubscription();
              },
            ),
            ListTile(
              leading: const Icon(Icons.payments_outlined),
              title: const Text('新增分期'),
              subtitle: const Text('记录负债账户、扣款账户和分期期数'),
              onTap: () {
                Navigator.pop(sheetContext);
                _openInstallment();
              },
            ),
            ListTile(
              leading: const Icon(Icons.savings_outlined),
              title: const Text('新增储蓄目标'),
              subtitle: const Text('设置目标金额，并从资产账户持续存入'),
              onTap: () {
                Navigator.pop(sheetContext);
                _openGoal();
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openSubscription([Subscription? existing]) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          SubscriptionSheet(controller: widget.controller, existing: existing),
    );
  }

  Future<void> _deleteSubscription(Subscription item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除固定订阅？'),
        content: Text('删除“${item.name}”后，不会再出现在规划提醒中。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.controller.deleteSubscription(item);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('固定订阅已删除')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('删除订阅失败：$error')));
      }
    }
  }

  Future<void> _openInstallment() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => InstallmentSheet(controller: widget.controller),
    );
  }

  Future<void> _deleteInstallment(Installment item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除分期计划？'),
        content: Text('“${item.name}”尚未处理的规划记录将被移除。已生成的分期流水不会被回滚。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.controller.deleteInstallment(item);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('分期计划已删除')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('删除分期失败：$error')));
      }
    }
  }

  Future<void> _openGoal([SavingsGoal? existing]) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          SavingsGoalSheet(controller: widget.controller, existing: existing),
    );
  }

  Future<void> _editTransaction(TransactionItem item) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) =>
          EditTransactionSheet(controller: widget.controller, item: item),
    );
  }

  Future<void> _deleteTransaction(TransactionItem item) async {
    if (item.installmentId != null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除这笔流水？'),
        content: Text('“${item.title}” ${_money(item.amountCents)} 将从当前账本移除。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.controller.deleteTransaction(item);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('流水已删除')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('删除失败：$error')));
      }
    }
  }
}

class LedgerSheet extends StatefulWidget {
  const LedgerSheet({
    required this.controller,
    this.existing,
    this.onDelete,
    super.key,
  });

  final LedgerController controller;
  final Ledger? existing;
  final Future<void> Function()? onDelete;

  @override
  State<LedgerSheet> createState() => _LedgerSheetState();
}

class _LedgerSheetState extends State<LedgerSheet> {
  late final TextEditingController name;
  late final TextEditingController icon;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    name = TextEditingController(text: widget.existing?.name ?? '');
    icon = TextEditingController(text: widget.existing?.icon ?? '📒');
  }

  @override
  void dispose() {
    name.dispose();
    icon.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (name.text.trim().isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请填写账本名称')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.controller.saveLedger(
        existing: widget.existing,
        name: name.text,
        icon: icon.text,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存账本失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.existing == null ? '新建账本' : '管理账本',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              widget.existing == null ? '为不同生活场景建立独立账本。' : '修改名称或图标不会影响已有流水。',
              style: TextStyle(color: Colors.grey.shade500),
            ),
            const SizedBox(height: 18),
            TextField(
              controller: name,
              autofocus: widget.existing == null,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: '账本名称',
                hintText: '例如：家庭账本、旅行账本',
                prefixIcon: Icon(Icons.menu_book_outlined),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: icon,
              maxLength: 4,
              decoration: const InputDecoration(
                labelText: '图标（可选）',
                hintText: '📒',
                prefixIcon: Icon(Icons.emoji_emotions_outlined),
              ),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: saving ? null : _save,
              icon: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(saving ? '保存中…' : '保存账本'),
            ),
            if (widget.existing != null && widget.onDelete != null) ...[
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: saving
                    ? null
                    : () async {
                        Navigator.pop(context);
                        await widget.onDelete!();
                      },
                icon: const Icon(Icons.delete_outline),
                label: const Text('删除这个账本'),
                style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class AccountSheet extends StatefulWidget {
  const AccountSheet({
    required this.controller,
    this.existing,
    this.onDelete,
    super.key,
  });

  final LedgerController controller;
  final Account? existing;
  final Future<void> Function()? onDelete;

  @override
  State<AccountSheet> createState() => _AccountSheetState();
}

class _AccountSheetState extends State<AccountSheet> {
  static const types = ['资产', '负债'];
  static const currencies = ['CNY', 'USD', 'JPY', 'EUR'];
  static const assetClasses = ['现金流', '投资', '储蓄', '信用'];

  late final TextEditingController name;
  late final TextEditingController balance;
  late final TextEditingController billDay;
  late final TextEditingController repaymentDay;
  late String type;
  late String currency;
  late String assetClass;
  late bool isInvestment;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    name = TextEditingController(text: existing?.name ?? '');
    balance = TextEditingController(
      text: existing == null
          ? ''
          : (existing.balanceCents.abs() / 100).toStringAsFixed(2),
    );
    billDay = TextEditingController(text: '${existing?.billDay ?? ''}');
    repaymentDay = TextEditingController(
      text: '${existing?.repaymentDay ?? ''}',
    );
    type = existing?.type == '负债' ? '负债' : '资产';
    currency = currencies.contains(existing?.currency)
        ? existing!.currency
        : 'CNY';
    assetClass = assetClasses.contains(existing?.assetClass)
        ? existing!.assetClass
        : (existing?.isInvestment == true ? '投资' : '现金流');
    isInvestment = existing?.isInvestment ?? false;
  }

  @override
  void dispose() {
    name.dispose();
    balance.dispose();
    billDay.dispose();
    repaymentDay.dispose();
    super.dispose();
  }

  int? _optionalDay(TextEditingController controller) {
    final value = controller.text.trim();
    if (value.isEmpty) return null;
    return int.tryParse(value);
  }

  Future<void> _save() async {
    final parsedBalance = double.tryParse(balance.text.trim());
    final parsedBillDay = _optionalDay(billDay);
    final parsedRepaymentDay = _optionalDay(repaymentDay);
    final validDays = [
      parsedBillDay,
      parsedRepaymentDay,
    ].whereType<int>().every((day) => day >= 1 && day <= 31);
    if (name.text.trim().isEmpty ||
        parsedBalance == null ||
        parsedBalance < 0 ||
        !validDays) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('请填写账户名称、有效余额，日期需为 1～31')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.controller.saveAccount(
        existing: widget.existing,
        name: name.text,
        type: type,
        balance: parsedBalance,
        billDay: type == '负债' ? parsedBillDay : null,
        repaymentDay: type == '负债' ? parsedRepaymentDay : null,
        isInvestment: type == '资产' && isInvestment,
        currency: currency,
        assetClass: type == '资产' ? assetClass : '信用',
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存账户失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final liability = type == '负债';
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.existing == null ? '新增账户' : '编辑账户',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              '账户余额以当前账本币种记录；修改余额会生成一笔余额调账记录，便于追溯。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 18),
            TextField(
              controller: name,
              autofocus: widget.existing == null,
              decoration: const InputDecoration(
                labelText: '账户名称',
                hintText: '例如：微信钱包、招商银行',
                prefixIcon: Icon(Icons.account_balance_wallet_outlined),
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: type,
              decoration: const InputDecoration(
                labelText: '账户类型',
                prefixIcon: Icon(Icons.category_outlined),
              ),
              items: types
                  .map(
                    (item) => DropdownMenuItem(value: item, child: Text(item)),
                  )
                  .toList(),
              onChanged: saving
                  ? null
                  : (value) {
                      if (value != null) setState(() => type = value);
                    },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: balance,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(
                labelText: liability ? '当前欠款' : '当前余额',
                hintText: '0.00',
                prefixIcon: const Icon(Icons.payments_outlined),
                suffixText: currency,
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: currency,
              decoration: const InputDecoration(
                labelText: '币种',
                prefixIcon: Icon(Icons.currency_exchange_outlined),
              ),
              items: currencies
                  .map(
                    (item) => DropdownMenuItem(value: item, child: Text(item)),
                  )
                  .toList(),
              onChanged: saving
                  ? null
                  : (value) {
                      if (value != null) setState(() => currency = value);
                    },
            ),
            if (!liability) ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: assetClass,
                decoration: const InputDecoration(
                  labelText: '资产归类',
                  prefixIcon: Icon(Icons.account_tree_outlined),
                ),
                items: assetClasses
                    .map(
                      (item) =>
                          DropdownMenuItem(value: item, child: Text(item)),
                    )
                    .toList(),
                onChanged: saving
                    ? null
                    : (value) {
                        if (value != null) setState(() => assetClass = value);
                      },
              ),
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                title: const Text('纳入投资资产'),
                subtitle: const Text('用于资产分析和投资收益统计'),
                value: isInvestment,
                onChanged: saving
                    ? null
                    : (value) => setState(() => isInvestment = value),
              ),
            ],
            if (liability) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: billDay,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: '账单日（可选）'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: repaymentDay,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: '还款日（可选）'),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: saving ? null : _save,
              icon: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(saving ? '保存中…' : '保存账户'),
            ),
            if (widget.existing != null && widget.onDelete != null) ...[
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: saving
                    ? null
                    : () async {
                        Navigator.pop(context);
                        await widget.onDelete!();
                      },
                icon: const Icon(Icons.delete_outline),
                label: const Text('注销这个账户'),
                style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class SettingsSheet extends StatefulWidget {
  const SettingsSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<SettingsSheet> createState() => _SettingsSheetState();
}

class _SettingsSheetState extends State<SettingsSheet> {
  late final TextEditingController baseUrl;
  late final TextEditingController autoLogSecret;
  late final TextEditingController extraPackages;
  bool saving = false;
  bool syncing = false;
  bool companionLoading = false;
  bool companionSaving = false;
  bool companionActionLoading = false;
  bool captureWechat = true;
  bool captureAlipay = true;
  bool captureMarketApps = true;
  Map<String, dynamic> companionStatus = const {};
  Timer? companionRefreshTimer;

  @override
  void initState() {
    super.initState();
    baseUrl = TextEditingController(text: widget.controller.api.baseUrl);
    autoLogSecret = TextEditingController(
      text: widget.controller.api.autoLogSecret,
    );
    extraPackages = TextEditingController();
    if (widget.controller.isAndroid) {
      _loadCompanionStatus();
      companionRefreshTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        _loadCompanionStatus(showLoading: false);
      });
    }
  }

  @override
  void dispose() {
    baseUrl.dispose();
    autoLogSecret.dispose();
    extraPackages.dispose();
    companionRefreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadCompanionStatus({bool showLoading = true}) async {
    if (!widget.controller.isAndroid) return;
    if (companionLoading) return;
    if (showLoading && mounted) setState(() => companionLoading = true);
    try {
      final status = await widget.controller.androidCaptureStatus();
      if (!mounted) return;
      setState(() {
        companionStatus = status;
        if (status['wechat'] is bool) {
          captureWechat = status['wechat'] as bool;
        }
        if (status['alipay'] is bool) {
          captureAlipay = status['alipay'] as bool;
        }
        if (status['marketApps'] is bool) {
          captureMarketApps = status['marketApps'] as bool;
        }
        final packages = status['extraPackages'];
        if (packages is String && extraPackages.text.isEmpty) {
          extraPackages.text = packages;
        }
      });
    } catch (error) {
      if (showLoading && mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('读取 Android 自动记账状态失败：$error')));
      }
    } finally {
      if (showLoading && mounted) setState(() => companionLoading = false);
    }
  }

  Future<void> _saveCompanion() async {
    setState(() => companionSaving = true);
    try {
      await widget.controller.configureAndroidCapture(
        secret: autoLogSecret.text,
        wechat: captureWechat,
        alipay: captureAlipay,
        marketApps: captureMarketApps,
        extraPackages: extraPackages.text,
      );
      await _loadCompanionStatus();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Android 自动记账配置已保存，请分别开启通知使用权和无障碍服务')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('保存 Android 自动记账配置失败：$error')));
      }
    } finally {
      if (mounted) setState(() => companionSaving = false);
    }
  }

  Future<void> _openAndroidSettings({required bool accessibility}) async {
    try {
      if (accessibility) {
        await widget.controller.openAndroidAccessibilitySettings();
      } else {
        await widget.controller.openAndroidNotificationSettings();
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('打开系统设置失败：$error')));
      }
    }
  }

  Future<void> _pasteCompanionConfiguration({
    required bool openNotificationSettings,
  }) async {
    if (companionActionLoading) return;
    setState(() => companionActionLoading = true);
    try {
      final clipboard = await Clipboard.getData(Clipboard.kTextPlain);
      final raw = clipboard?.text?.trim() ?? '';
      if (raw.isEmpty) throw const ApiException('剪贴板中没有 Android 配置');
      final decoded = jsonDecode(raw);
      if (decoded is! Map) {
        throw const ApiException('剪贴板内容不是有效的 Android 配置');
      }
      final type = '${decoded['type'] ?? ''}'.trim();
      if (type != 'neo-ledger-android-config-v1') {
        throw const ApiException('请从 Neo Ledger 的“复制安卓配置”按钮复制配置');
      }
      final endpoint = '${decoded['url'] ?? decoded['endpoint'] ?? ''}'.trim();
      final secret = '${decoded['token'] ?? decoded['secret'] ?? ''}'.trim();
      if (endpoint.isEmpty) throw const ApiException('配置中缺少服务地址');
      if (secret.length < 20) throw const ApiException('配置中缺少有效的自动记账密钥');
      final pastedLedgerId = switch (decoded['ledgerId']) {
        int value => value,
        num value => value.toInt(),
        String value => int.tryParse(value.trim()),
        _ => null,
      };
      final selectedLedgerId = widget.controller.selectedLedger?.id;
      if (pastedLedgerId != null &&
          selectedLedgerId != null &&
          pastedLedgerId != selectedLedgerId) {
        throw ApiException(
          '配置属于账本 $pastedLedgerId，当前选择的是账本 $selectedLedgerId；请先切换账本后再粘贴',
        );
      }

      await widget.controller.saveBaseUrl(endpoint);
      baseUrl.text = widget.controller.api.baseUrl;
      autoLogSecret.text = secret;
      await widget.controller.configureAndroidCapture(
        secret: secret,
        wechat: captureWechat,
        alipay: captureAlipay,
        marketApps: captureMarketApps,
        extraPackages: extraPackages.text,
      );
      await Clipboard.setData(const ClipboardData(text: ''));
      await _loadCompanionStatus();
      if (openNotificationSettings) {
        await widget.controller.openAndroidNotificationSettings();
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              openNotificationSettings
                  ? '配置已粘贴并保存，请在系统页面开启通知使用权'
                  : 'Android 自动记账配置已粘贴并保存',
            ),
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('粘贴 Android 配置失败：$error')));
      }
    } finally {
      if (mounted) setState(() => companionActionLoading = false);
    }
  }

  Future<void> _sendAndroidTest() async {
    if (companionActionLoading || companionSaving) return;
    setState(() => companionActionLoading = true);
    try {
      await widget.controller.configureAndroidCapture(
        secret: autoLogSecret.text,
        wechat: captureWechat,
        alipay: captureAlipay,
        marketApps: captureMarketApps,
        extraPackages: extraPackages.text,
      );
      final result = await widget.controller.sendAndroidTestBill();
      await _loadCompanionStatus();
      final ok = result['ok'] == true;
      final message = '${result['message'] ?? (ok ? '测试账单已发送' : '测试账单发送失败')}';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(ok ? message : '测试账单发送失败：$message')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('发送测试账单失败：$error')));
      }
    } finally {
      if (mounted) setState(() => companionActionLoading = false);
    }
  }

  Future<void> _flushAndroidPending() async {
    if (companionActionLoading) return;
    setState(() => companionActionLoading = true);
    try {
      await widget.controller.flushAndroidPending();
      await Future<void>.delayed(const Duration(milliseconds: 350));
      await _loadCompanionStatus();
      await Future<void>.delayed(const Duration(milliseconds: 750));
      await _loadCompanionStatus();
      if (mounted) {
        final pending = companionStatus['pending'] ?? 0;
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('已触发待处理账单发送，当前剩余 $pending 条')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('发送待处理账单失败：$error')));
      }
    } finally {
      if (mounted) setState(() => companionActionLoading = false);
    }
  }

  Future<void> _openAndroidSystemSettings({required bool battery}) async {
    try {
      if (battery) {
        await widget.controller.openAndroidBatterySettings();
      } else {
        await widget.controller.openAndroidAutostartSettings();
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('打开系统设置失败：$error')));
      }
    }
  }

  Widget _androidCaptureCard(LedgerController controller) {
    final configured = companionStatus['configured'] == true;
    final notificationEnabled = companionStatus['notificationEnabled'] == true;
    final accessibilityEnabled =
        companionStatus['accessibilityEnabled'] == true;
    final pending = (companionStatus['pending'] as num?)?.toInt() ?? 0;
    final lastStatus = '${companionStatus['lastStatus'] ?? ''}'.trim();
    final lastCaptured = '${companionStatus['lastCaptured'] ?? ''}'.trim();
    final accessibilitySummary =
        '${companionStatus['accessibilitySummary'] ?? ''}'.trim();
    final companionLedgerId = companionStatus['ledgerId'];
    final accessibilityEvents = companionStatus['accessibilityEventCount'] ?? 0;
    final accessibilityScans = companionStatus['accessibilityScanCount'] ?? 0;
    final accessibilityRecognized =
        companionStatus['accessibilityRecognizedCount'] ?? 0;
    final accessibilityRejected =
        companionStatus['accessibilityRejectedCount'] ?? 0;
    final lastAccessibilityPackage =
        '${companionStatus['lastAccessibilityPackage'] ?? ''}'.trim();
    final lastAccessibilityReason =
        '${companionStatus['lastAccessibilityReason'] ?? ''}'.trim();
    final deliverySummary = '${companionStatus['deliverySummary'] ?? ''}'
        .trim();
    final actionBusy = companionActionLoading || companionSaving;

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Android 自动记账',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
                if (companionLoading)
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                IconButton(
                  tooltip: '刷新状态',
                  onPressed: companionLoading ? null : _loadCompanionStatus,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            Text(
              '通知监听用于支付通知；无障碍服务只读当前前台支付 App 的支付完成界面并做本地 OCR/文本判定。不会点击、输入、发起支付，也不会因打开照片、订单历史或普通商品详情入账。',
              style: TextStyle(
                color: Colors.grey.shade600,
                fontSize: 12,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: autoLogSecret,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: '自动记账连接密钥',
                hintText: '从 Web 端自动记账连接复制，不是登录密码',
                prefixIcon: Icon(Icons.key_outlined),
              ),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('微信支付通知'),
              value: captureWechat,
              onChanged: (value) => setState(() => captureWechat = value),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('支付宝支付通知'),
              value: captureAlipay,
              onChanged: (value) => setState(() => captureAlipay = value),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('淘宝 / 京东 / 美团 / 抖音 / 小红书 / 闲鱼等支付'),
              subtitle: const Text('仅识别这些应用当前前台的支付完成界面'),
              value: captureMarketApps,
              onChanged: (value) => setState(() => captureMarketApps = value),
            ),
            TextField(
              controller: extraPackages,
              decoration: const InputDecoration(
                labelText: '其他应用包名（可选）',
                hintText: '多个包名用英文逗号分隔',
                prefixIcon: Icon(Icons.apps_outlined),
              ),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: actionBusy ? null : _saveCompanion,
              icon: companionSaving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(companionSaving ? '保存中…' : '保存 Android 自动记账配置'),
            ),
            const Divider(height: 24),
            _SettingRow(label: '连接配置', value: configured ? '已配置' : '未配置'),
            _SettingRow(
              label: '通知使用权',
              value: notificationEnabled ? '已开启' : '未开启',
            ),
            _SettingRow(
              label: '无障碍支付识别',
              value: accessibilityEnabled ? '已开启' : '未开启',
            ),
            if (companionLedgerId != null)
              _SettingRow(label: '自动记账账本', value: '$companionLedgerId'),
            _SettingRow(label: '待发送', value: '$pending 条'),
            if (deliverySummary.isNotEmpty)
              _SettingRow(label: '发送统计', value: deliverySummary),
            if (lastStatus.isNotEmpty && lastStatus != '尚未发送通知')
              Text(
                '发送状态：$lastStatus',
                style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
              ),
            if (lastCaptured.isNotEmpty && lastCaptured != '尚未捕获支付通知')
              Text(
                '最近捕获：$lastCaptured',
                style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
              ),
            if (accessibilitySummary.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  accessibilitySummary,
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                ),
              ),
            if (accessibilityEnabled || accessibilityEvents != 0)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  '诊断：事件 $accessibilityEvents · 扫描 $accessibilityScans · '
                  '识别成功 $accessibilityRecognized · 拒绝 $accessibilityRejected',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                ),
              ),
            if (lastAccessibilityPackage.isNotEmpty ||
                lastAccessibilityReason.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  '最近判定：${lastAccessibilityPackage.isEmpty ? '未知应用' : lastAccessibilityPackage}'
                  '${lastAccessibilityReason.isEmpty ? '' : ' · $lastAccessibilityReason'}',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                ),
              ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.icon(
                  onPressed: actionBusy
                      ? null
                      : () => _pasteCompanionConfiguration(
                          openNotificationSettings: true,
                        ),
                  icon: const Icon(Icons.content_paste_go_outlined),
                  label: const Text('一键粘贴配置并开启通知权限'),
                ),
                OutlinedButton.icon(
                  onPressed: actionBusy
                      ? null
                      : () => _pasteCompanionConfiguration(
                          openNotificationSettings: false,
                        ),
                  icon: const Icon(Icons.content_paste_outlined),
                  label: const Text('从 Neo Ledger 粘贴配置'),
                ),
                OutlinedButton.icon(
                  onPressed: actionBusy
                      ? null
                      : () => _openAndroidSettings(accessibility: false),
                  icon: const Icon(Icons.notifications_outlined),
                  label: const Text('通知使用权'),
                ),
                OutlinedButton.icon(
                  onPressed: actionBusy
                      ? null
                      : () => _openAndroidSettings(accessibility: true),
                  icon: const Icon(Icons.accessibility_new),
                  label: const Text('无障碍服务'),
                ),
                OutlinedButton.icon(
                  onPressed: actionBusy
                      ? null
                      : () => _openAndroidSystemSettings(battery: false),
                  icon: const Icon(Icons.restart_alt_outlined),
                  label: const Text('厂商自启动 / 后台设置'),
                ),
                OutlinedButton.icon(
                  onPressed: actionBusy
                      ? null
                      : () => _openAndroidSystemSettings(battery: true),
                  icon: const Icon(Icons.battery_saver_outlined),
                  label: const Text('系统省电设置'),
                ),
                OutlinedButton.icon(
                  onPressed: actionBusy ? null : _sendAndroidTest,
                  icon: const Icon(Icons.receipt_long_outlined),
                  label: const Text('发送 ¥0.01 测试账单'),
                ),
                FilledButton.icon(
                  onPressed: actionBusy ? null : _flushAndroidPending,
                  style: FilledButton.styleFrom(
                    backgroundColor: pending > 0
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).colorScheme.surfaceContainerHighest,
                    foregroundColor: pending > 0
                        ? Theme.of(context).colorScheme.onPrimary
                        : Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                  icon: const Icon(Icons.cloud_upload_outlined),
                  label: Text(
                    pending > 0 ? '立即发送待处理账单（$pending 条）' : '立即发送待处理账单',
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String get _platformKey {
    if (kIsWeb) return 'web';
    return switch (defaultTargetPlatform) {
      TargetPlatform.android => 'android',
      TargetPlatform.iOS => 'ios',
      TargetPlatform.windows => 'windows',
      TargetPlatform.macOS => 'macos',
      _ => 'web',
    };
  }

  String _availabilityLabel(String mode) {
    return switch (mode) {
      'native' => '客户端已接入',
      'server' => '通过统一服务',
      'android' => 'Android 专属',
      'n/a' => '不适用',
      _ => '待确认',
    };
  }

  Future<void> _saveUrl() async {
    setState(() => saving = true);
    try {
      await widget.controller.saveBaseUrl(baseUrl.text);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('连接地址已保存')));
        setState(() => saving = false);
      }
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存连接地址失败：$error')));
      }
    }
  }

  Future<void> _sync() async {
    setState(() => syncing = true);
    try {
      await widget.controller.syncQueue();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('同步完成')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('同步失败：$error')));
      }
    } finally {
      if (mounted) setState(() => syncing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('连接与同步', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(
              '电脑、手机和平板都使用同一个 API 地址。部署到 NAS 或网站时，请使用设备可访问的 HTTPS 地址；localhost 只适用于当前设备。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 18),
            TextField(
              controller: baseUrl,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Neo Ledger 地址',
                hintText: 'https://ledger.example.com',
                prefixIcon: Icon(Icons.link_outlined),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: saving ? null : _saveUrl,
              icon: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(saving ? '保存中…' : '保存连接地址'),
            ),
            const SizedBox(height: 18),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '同步状态',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 10),
                    _SettingRow(
                      label: '本地待同步',
                      value: '${controller.pendingCount} 条',
                    ),
                    _SettingRow(
                      label: '服务器待处理',
                      value: '${controller.pendingServerCount} 条',
                    ),
                    _SettingRow(
                      label: '未读通知',
                      value: '${controller.unreadNotificationCount} 条',
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: syncing ? null : _sync,
                      icon: syncing
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.sync),
                      label: Text(syncing ? '同步中…' : '立即同步并刷新'),
                    ),
                  ],
                ),
              ),
            ),
            if (controller.isAndroid) ...[
              const SizedBox(height: 12),
              _androidCaptureCard(controller),
            ],
            const SizedBox(height: 12),
            Card(
              child: ExpansionTile(
                leading: const Icon(Icons.devices_other_outlined),
                title: const Text('跨端功能总览'),
                subtitle: Text(
                  '${FeatureCatalog.all.length} 个功能域 · 使用统一 API 与数据模型',
                ),
                children: [
                  for (final feature in FeatureCatalog.all)
                    ListTile(
                      dense: true,
                      title: Text(feature.label),
                      subtitle: Text(feature.entryPoint),
                      trailing: Text(
                        _availabilityLabel(
                          feature.availability[_platformKey] ?? 'n/a',
                        ),
                        style: TextStyle(
                          color: Colors.grey.shade600,
                          fontSize: 12,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.category_outlined),
                    title: const Text('分类管理'),
                    subtitle: Text(
                      '支出 ${controller.expenseCategories.length} 类 · 收入 ${controller.incomeCategories.length} 类',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      useSafeArea: true,
                      builder: (_) =>
                          CategoryManagerSheet(controller: controller),
                    ),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.lock_outline),
                    title: const Text('隐私与安全'),
                    subtitle: Text(
                      controller.preferences.lockEnabled
                          ? '账本隐私锁已开启'
                          : '配置账本隐私锁与 PIN',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      useSafeArea: true,
                      builder: (_) => SecuritySheet(controller: controller),
                    ),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.auto_awesome_outlined),
                    title: const Text('AI 财务助手'),
                    subtitle: const Text('分析当前账本，不会自动写入或替你付款'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      useSafeArea: true,
                      builder: (_) => AiSheet(controller: controller),
                    ),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.rule_folder_outlined),
                    title: const Text('自动化记账规则'),
                    subtitle: Text(
                      '${controller.automationRules.length} 条规则 · 只处理已识别的支付/导入事件',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      useSafeArea: true,
                      builder: (_) =>
                          AutomationRulesSheet(controller: controller),
                    ),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.key_outlined),
                    title: const Text('快捷同步连接'),
                    subtitle: Text(
                      controller.quickSyncStatus?.active == true
                          ? '已启用 · ${controller.quickSyncStatus?.label ?? '未命名连接'}'
                          : '未启用 · 为 NAS、快捷指令或外部设备生成受限令牌',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      useSafeArea: true,
                      builder: (_) => QuickSyncSheet(controller: controller),
                    ),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.devices_outlined),
                    title: const Text('登录会话与安全审计'),
                    subtitle: Text(
                      '${controller.securitySessions.length} 个会话 · ${controller.securityAudit.events.length} 条安全事件',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      useSafeArea: true,
                      builder: (_) =>
                          SecuritySessionsSheet(controller: controller),
                    ),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.currency_exchange_outlined),
                    title: const Text('汇率'),
                    subtitle: Text(
                      controller.exchangeRates == null
                          ? '尚未读取汇率快照'
                          : '基准 ${controller.exchangeRates!.base} · ${controller.exchangeRates!.rates.length} 个币种',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      useSafeArea: true,
                      builder: (_) =>
                          ExchangeRatesSheet(controller: controller),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '多端互通状态',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 10),
                    _SettingRow(
                      label: 'P2P 协议',
                      value: '${controller.p2pStatus['protocol'] ?? '未读取'}',
                    ),
                    _SettingRow(
                      label: '当前节点',
                      value: '${controller.p2pStatus['peers'] ?? 0} 个设备',
                    ),
                    const SizedBox(height: 6),
                    Text(
                      '原生端当前使用统一 API 做跨端账本同步；P2P/WebRTC 状态仅展示服务端发现能力，不能冒充已建立直连。',
                      style: TextStyle(
                        color: Colors.grey.shade600,
                        fontSize: 12,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              '当前版本 $_nativeVersion · 数据写入使用当前登录会话 · 删除操作遵循服务器版本校验。',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingRow extends StatelessWidget {
  const _SettingRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.grey.shade500)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class AutomationRulesSheet extends StatefulWidget {
  const AutomationRulesSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<AutomationRulesSheet> createState() => _AutomationRulesSheetState();
}

class _AutomationRulesSheetState extends State<AutomationRulesSheet> {
  bool loading = false;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => loading = true);
    try {
      await widget.controller.refreshAutomationRules();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('读取自动化规则失败：$error')));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _edit([AutomationRule? rule]) async {
    final payload = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) =>
          AutomationRuleEditorSheet(controller: widget.controller, rule: rule),
    );
    if (payload == null || !mounted) return;
    setState(() => saving = true);
    try {
      final conditions = Map<String, dynamic>.from(
        (payload['conditions'] as Map?)?.cast<String, dynamic>() ?? const {},
      );
      final actions = Map<String, dynamic>.from(
        (payload['actions'] as Map?)?.cast<String, dynamic>() ?? const {},
      );
      if (rule == null) {
        await widget.controller.createAutomationRule(
          name: '${payload['name'] ?? ''}',
          priority: _settingInt(payload['priority'], fallback: 100),
          enabled: payload['enabled'] == true,
          conditions: conditions,
          actions: actions,
        );
      } else {
        await widget.controller.updateAutomationRule(
          rule: rule,
          name: '${payload['name'] ?? ''}',
          priority: _settingInt(payload['priority'], fallback: rule.priority),
          enabled: payload['enabled'] == true,
          conditions: conditions,
          actions: actions,
        );
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(rule == null ? '规则已创建' : '规则已更新')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存规则失败：$error')));
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _toggle(AutomationRule rule, bool enabled) async {
    try {
      await widget.controller.updateAutomationRuleEnabled(rule, enabled);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('更新规则状态失败：$error')));
      }
    }
  }

  Future<void> _delete(AutomationRule rule) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除自动化规则？'),
        content: Text('“${rule.name}”删除后不会再处理新收到的支付或导入事件。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.controller.deleteAutomationRule(rule);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('规则已删除')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('删除规则失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '自动化记账规则',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ),
                IconButton(
                  tooltip: '刷新规则',
                  onPressed: loading || saving ? null : _load,
                  icon: const Icon(Icons.refresh),
                ),
                FilledButton.icon(
                  onPressed: saving ? null : () => _edit(),
                  icon: const Icon(Icons.add),
                  label: const Text('新建'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '规则只作用于已经被通知监听、无障碍支付识别或账单导入判定为有效的事件，不会扫描照片、历史订单，也不会替你发起支付。优先级数字越小越先执行。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 16),
            if (loading)
              const Center(child: CircularProgressIndicator())
            else if (controller.automationRules.isEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    children: [
                      Icon(
                        Icons.rule_outlined,
                        size: 42,
                        color: Colors.grey.shade500,
                      ),
                      const SizedBox(height: 8),
                      const Text('还没有自动化规则'),
                      const SizedBox(height: 4),
                      Text(
                        '例如：商户包含“打车”时自动归入交通，并标记为刚需。',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.grey.shade500,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
              )
            else
              ...controller.automationRules.map(
                (rule) => Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: Column(
                    children: [
                      ListTile(
                        onTap: saving ? null : () => _edit(rule),
                        leading: CircleAvatar(
                          backgroundColor: rule.enabled
                              ? _brand.withValues(alpha: 0.18)
                              : Colors.grey.withValues(alpha: 0.16),
                          child: Icon(
                            Icons.rule,
                            color: rule.enabled ? _brand : Colors.grey,
                          ),
                        ),
                        title: Text(rule.name),
                        subtitle: Text(
                          '优先级 ${rule.priority} · ${rule.enabled ? '运行中' : '已停用'}',
                        ),
                        trailing: Switch.adaptive(
                          value: rule.enabled,
                          onChanged: saving
                              ? null
                              : (value) => _toggle(rule, value),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '匹配：${_ruleConditionsSummary(rule.conditions)}',
                              style: TextStyle(
                                color: Colors.grey.shade400,
                                fontSize: 12,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '动作：${_ruleActionsSummary(rule.actions)}',
                              style: TextStyle(
                                color: Colors.grey.shade400,
                                fontSize: 12,
                              ),
                            ),
                            Align(
                              alignment: Alignment.centerRight,
                              child: TextButton.icon(
                                onPressed: saving ? null : () => _delete(rule),
                                icon: const Icon(
                                  Icons.delete_outline,
                                  size: 18,
                                ),
                                label: const Text('删除'),
                                style: TextButton.styleFrom(
                                  foregroundColor: Colors.redAccent,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class AutomationRuleEditorSheet extends StatefulWidget {
  const AutomationRuleEditorSheet({
    required this.controller,
    this.rule,
    super.key,
  });

  final LedgerController controller;
  final AutomationRule? rule;

  @override
  State<AutomationRuleEditorSheet> createState() =>
      _AutomationRuleEditorSheetState();
}

class _AutomationRuleEditorSheetState extends State<AutomationRuleEditorSheet> {
  late final TextEditingController name;
  late final TextEditingController merchant;
  late final TextEditingController source;
  late final TextEditingController minAmount;
  late final TextEditingController maxAmount;
  late final TextEditingController priority;
  String? category;
  String mood = '刚需';
  bool enabled = true;

  @override
  void initState() {
    super.initState();
    final rule = widget.rule;
    final conditions = rule?.conditions ?? const <String, dynamic>{};
    final actions = rule?.actions ?? const <String, dynamic>{};
    name = TextEditingController(text: rule?.name ?? '');
    merchant = TextEditingController(
      text: '${conditions['merchantContains'] ?? ''}',
    );
    source = TextEditingController(text: '${conditions['source'] ?? ''}');
    minAmount = TextEditingController(
      text: _storedYuan(conditions['minAmount']),
    );
    maxAmount = TextEditingController(
      text: _storedYuan(conditions['maxAmount']),
    );
    priority = TextEditingController(text: '${rule?.priority ?? 100}');
    category = actions['category']?.toString();
    final savedMood = actions['mood']?.toString();
    if (['悦己', '刚需', '冲动'].contains(savedMood)) mood = savedMood!;
    enabled = rule?.enabled ?? true;
  }

  @override
  void dispose() {
    name.dispose();
    merchant.dispose();
    source.dispose();
    minAmount.dispose();
    maxAmount.dispose();
    priority.dispose();
    super.dispose();
  }

  void _save() {
    final trimmedName = name.text.trim();
    final min = _parseYuan(minAmount.text);
    final max = _parseYuan(maxAmount.text);
    final hasCondition =
        merchant.text.trim().isNotEmpty ||
        source.text.trim().isNotEmpty ||
        min != null ||
        max != null;
    final available = widget.controller.expenseCategories;
    final selectedCategory = available.any((item) => item.name == category)
        ? category
        : null;
    if (trimmedName.isEmpty) {
      _error('请输入规则名称');
      return;
    }
    if (!hasCondition) {
      _error('至少设置一个匹配条件');
      return;
    }
    if (minAmount.text.trim().isNotEmpty && min == null ||
        maxAmount.text.trim().isNotEmpty && max == null) {
      _error('金额条件请输入有效数字');
      return;
    }
    if (min != null && max != null && min > max) {
      _error('最低金额不能大于最高金额');
      return;
    }
    if (selectedCategory == null) {
      _error('请选择自动归入的支出分类');
      return;
    }
    final conditions = <String, dynamic>{
      if (merchant.text.trim().isNotEmpty)
        'merchantContains': merchant.text.trim(),
      if (source.text.trim().isNotEmpty) 'source': source.text.trim(),
      'minAmount': ?min,
      'maxAmount': ?max,
    };
    Navigator.pop(context, <String, dynamic>{
      'name': trimmedName,
      'priority': _settingInt(
        priority.text,
        fallback: 100,
      ).clamp(0, 9999).toInt(),
      'enabled': enabled,
      'conditions': conditions,
      'actions': <String, dynamic>{'category': selectedCategory, 'mood': mood},
    });
  }

  void _error(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final categories = widget.controller.expenseCategories;
    final selectedCategory = categories.any((item) => item.name == category)
        ? category
        : null;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.rule == null ? '新建自动化规则' : '编辑自动化规则',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: name,
              decoration: const InputDecoration(
                labelText: '规则名称',
                hintText: '例如：打车自动归类',
                prefixIcon: Icon(Icons.title_outlined),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              '匹配条件（至少填写一项）',
              style: TextStyle(
                color: Colors.grey.shade400,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: merchant,
              decoration: const InputDecoration(
                labelText: '商户名称包含',
                hintText: '例如：肯德基、滴滴、超市',
                prefixIcon: Icon(Icons.storefront_outlined),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: source,
              decoration: const InputDecoration(
                labelText: '来源包含（可选）',
                hintText: '例如：支付宝、微信、抖音',
                prefixIcon: Icon(Icons.account_balance_wallet_outlined),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: minAmount,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: const InputDecoration(
                      labelText: '最低金额（元）',
                      prefixText: '¥ ',
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: maxAmount,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: const InputDecoration(
                      labelText: '最高金额（元）',
                      prefixText: '¥ ',
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              '自动处理动作',
              style: TextStyle(
                color: Colors.grey.shade400,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: selectedCategory,
              decoration: const InputDecoration(
                labelText: '支出分类',
                prefixIcon: Icon(Icons.category_outlined),
              ),
              items: categories
                  .map(
                    (item) => DropdownMenuItem<String>(
                      value: item.name,
                      child: Text('${item.icon} ${item.name}'),
                    ),
                  )
                  .toList(),
              onChanged: (value) => setState(() => category = value),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: mood,
              decoration: const InputDecoration(
                labelText: '消费情绪',
                prefixIcon: Icon(Icons.mood_outlined),
              ),
              items: const ['刚需', '悦己', '冲动']
                  .map(
                    (value) =>
                        DropdownMenuItem(value: value, child: Text(value)),
                  )
                  .toList(),
              onChanged: (value) => setState(() => mood = value ?? '刚需'),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: priority,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: '优先级',
                      helperText: '数字越小越先执行',
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('启用规则'),
                    value: enabled,
                    onChanged: (value) => setState(() => enabled = value),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: _save,
              icon: const Icon(Icons.save_outlined),
              label: Text(widget.rule == null ? '创建规则' : '保存修改'),
            ),
          ],
        ),
      ),
    );
  }
}

class QuickSyncSheet extends StatefulWidget {
  const QuickSyncSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<QuickSyncSheet> createState() => _QuickSyncSheetState();
}

class _QuickSyncSheetState extends State<QuickSyncSheet> {
  late final TextEditingController label;
  late final TextEditingController expiresInDays;
  bool loading = false;
  bool creating = false;
  String? token;

  @override
  void initState() {
    super.initState();
    label = TextEditingController(text: '自动记账连接');
    expiresInDays = TextEditingController(text: '365');
    _load();
  }

  @override
  void dispose() {
    label.dispose();
    expiresInDays.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      await widget.controller.refreshQuickSync();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('读取快捷同步状态失败：$error')));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _create() async {
    final days = _settingInt(
      expiresInDays.text,
      fallback: 365,
    ).clamp(1, 730).toInt();
    setState(() => creating = true);
    try {
      final value = await widget.controller.createQuickSyncToken(
        label: label.text.trim().isEmpty ? '自动记账连接' : label.text.trim(),
        expiresInDays: days,
        scope: 'ledger:write',
      );
      if (!mounted) return;
      setState(() => token = value);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('令牌已生成，只会在这里显示一次')));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('生成快捷同步令牌失败：$error')));
      }
    } finally {
      if (mounted) setState(() => creating = false);
    }
  }

  Future<void> _revoke() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('撤销快捷同步连接？'),
        content: const Text('撤销后，NAS、快捷指令或其他设备使用旧令牌将无法继续写入账本。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
            child: const Text('确认撤销'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.controller.revokeQuickSyncToken();
      if (mounted) {
        setState(() => token = null);
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('快捷同步连接已撤销')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('撤销快捷同步连接失败：$error')));
      }
    }
  }

  Future<void> _copyToken() async {
    final value = token;
    if (value == null) return;
    await Clipboard.setData(ClipboardData(text: value));
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('令牌已复制')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = widget.controller.quickSyncStatus;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '快捷同步连接',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ),
                IconButton(
                  tooltip: '刷新状态',
                  onPressed: loading ? null : _load,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            Text(
              '用于 NAS、快捷指令或外部自动化设备的受限写入连接。令牌只显示一次，不能代替登录密码；需要变更时直接生成新令牌，旧令牌会被替换。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _SettingRow(
                      label: '状态',
                      value: status?.active == true ? '已启用' : '未启用',
                    ),
                    if (status?.tokenPrefix != null)
                      _SettingRow(label: '令牌前缀', value: status!.tokenPrefix!),
                    if (status?.label != null)
                      _SettingRow(label: '连接名称', value: status!.label!),
                    if (status?.scope != null)
                      _SettingRow(label: '权限范围', value: status!.scope!),
                    if (status?.expiresAt != null)
                      _SettingRow(label: '到期时间', value: status!.expiresAt!),
                    _SettingRow(
                      label: '已处理事件',
                      value: '${status?.processedCount ?? 0} 条',
                    ),
                    if (status?.lastEventAt != null)
                      _SettingRow(label: '最近事件', value: status!.lastEventAt!),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: label,
              decoration: const InputDecoration(
                labelText: '连接名称',
                prefixIcon: Icon(Icons.label_outline),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: expiresInDays,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: '有效期（天）',
                helperText: '1～730 天，生成新令牌会替换旧令牌',
                prefixIcon: Icon(Icons.event_outlined),
              ),
            ),
            const SizedBox(height: 10),
            const InputDecorator(
              decoration: InputDecoration(
                labelText: '权限范围',
                prefixIcon: Icon(Icons.shield_outlined),
              ),
              child: Text('仅写入当前账本（ledger:write）'),
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: creating ? null : _create,
              icon: creating
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.vpn_key_outlined),
              label: Text(creating ? '生成中…' : '生成新令牌'),
            ),
            if (token != null) ...[
              const SizedBox(height: 12),
              Card(
                color: Colors.orange.withValues(alpha: 0.12),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '请立即复制保存，关闭此窗口后不会再次显示完整令牌。',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 8),
                      SelectableText(
                        token!,
                        style: const TextStyle(fontSize: 12),
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton.icon(
                          onPressed: _copyToken,
                          icon: const Icon(Icons.copy_outlined),
                          label: const Text('复制令牌'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            if (status?.active == true) ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: _revoke,
                icon: const Icon(Icons.link_off_outlined),
                label: const Text('撤销当前连接'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.redAccent,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class SecuritySessionsSheet extends StatefulWidget {
  const SecuritySessionsSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<SecuritySessionsSheet> createState() => _SecuritySessionsSheetState();
}

class _SecuritySessionsSheetState extends State<SecuritySessionsSheet> {
  bool loading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      await widget.controller.refreshSecurityCenter();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('读取安全中心失败：$error')));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _revoke(SecuritySession session) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('注销“${session.displayName}”？'),
        content: const Text('该设备之后需要重新登录，当前设备不能被注销。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('注销设备'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.controller.revokeSecuritySession(session);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('设备会话已注销')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('注销设备失败：$error')));
      }
    }
  }

  Future<void> _revokeOthers() async {
    try {
      await widget.controller.revokeOtherSecuritySessions();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('其他设备会话已注销')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('注销其他设备失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final others = controller.securitySessions
        .where((item) => !item.current)
        .toList();
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '登录会话与安全审计',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ),
                IconButton(
                  tooltip: '刷新安全状态',
                  onPressed: loading ? null : _load,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            Text(
              '这里列出当前登录设备和关键安全事件。注销其他设备不会删除账单，只会使对应登录会话失效。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 16),
            if (loading)
              const Center(child: CircularProgressIndicator())
            else if (controller.securitySessions.isEmpty)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(20),
                  child: Text('暂时没有可显示的登录设备'),
                ),
              )
            else
              ...controller.securitySessions.map(
                (session) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: Icon(
                      session.current ? Icons.phone_android : Icons.devices,
                      color: session.current ? _brand : null,
                    ),
                    title: Text(
                      '${session.displayName}${session.current ? ' · 当前设备' : ''}',
                    ),
                    subtitle: Text(
                      '${session.ipAddress.isEmpty ? '未知地址' : session.ipAddress}\n最近使用：${session.lastUsedAt}',
                    ),
                    isThreeLine: true,
                    trailing: session.current
                        ? const Chip(label: Text('当前'))
                        : IconButton(
                            tooltip: '注销设备',
                            onPressed: () => _revoke(session),
                            icon: const Icon(
                              Icons.logout,
                              color: Colors.redAccent,
                            ),
                          ),
                  ),
                ),
              ),
            if (others.isNotEmpty) ...[
              const SizedBox(height: 4),
              OutlinedButton.icon(
                onPressed: _revokeOthers,
                icon: const Icon(Icons.logout_outlined),
                label: Text('注销其他 ${others.length} 台设备'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.redAccent,
                ),
              ),
            ],
            const SizedBox(height: 20),
            Text('最近安全事件', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (controller.securityAudit.events.isEmpty)
              Text('暂无安全审计事件', style: TextStyle(color: Colors.grey.shade500))
            else
              ...controller.securityAudit.events
                  .take(20)
                  .map(
                    (event) => ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.history, size: 20),
                      title: Text(event.event),
                      subtitle: Text(event.createdAt),
                    ),
                  ),
          ],
        ),
      ),
    );
  }
}

class ExchangeRatesSheet extends StatefulWidget {
  const ExchangeRatesSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<ExchangeRatesSheet> createState() => _ExchangeRatesSheetState();
}

class _ExchangeRatesSheetState extends State<ExchangeRatesSheet> {
  bool loading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      await widget.controller.refreshExchangeRates();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('读取汇率失败：$error')));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rates = widget.controller.exchangeRates;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '汇率',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ),
                IconButton(
                  tooltip: '刷新汇率',
                  onPressed: loading ? null : _load,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            Text(
              '汇率仅用于多币种账单展示和统计换算，不会修改原始账单金额。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 16),
            if (loading)
              const Center(child: CircularProgressIndicator())
            else if (rates == null)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(20),
                  child: Text('暂时没有汇率快照'),
                ),
              )
            else ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      _SettingRow(label: '基准货币', value: rates.base),
                      _SettingRow(label: '数据来源', value: rates.source),
                      _SettingRow(label: '更新时间', value: rates.updatedAt),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),
              ...rates.rates.entries.map(
                (entry) => Card(
                  margin: const EdgeInsets.only(bottom: 6),
                  child: ListTile(
                    dense: true,
                    leading: const Icon(Icons.currency_exchange),
                    title: Text(entry.key),
                    trailing: Text(
                      entry.value.toStringAsFixed(4),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

int _settingInt(Object? value, {int fallback = 0}) =>
    int.tryParse('$value') ?? fallback;

String _storedYuan(Object? value) {
  final cents = double.tryParse('$value');
  if (cents == null) return '';
  return (cents / 100).toStringAsFixed(2);
}

double? _parseYuan(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return null;
  final parsed = double.tryParse(trimmed);
  return parsed == null || parsed < 0 ? null : parsed;
}

String _ruleConditionsSummary(Map<String, dynamic> conditions) {
  final parts = <String>[];
  final merchant = conditions['merchantContains']?.toString().trim();
  final source = conditions['source']?.toString().trim();
  if (merchant != null && merchant.isNotEmpty) parts.add('商户含“$merchant”');
  if (source != null && source.isNotEmpty) parts.add('来源含“$source”');
  if (conditions['minAmount'] != null) {
    parts.add('金额≥${_money(_settingInt(conditions['minAmount']))}');
  }
  if (conditions['maxAmount'] != null) {
    parts.add('金额≤${_money(_settingInt(conditions['maxAmount']))}');
  }
  return parts.isEmpty ? '无条件' : parts.join('，');
}

String _ruleActionsSummary(Map<String, dynamic> actions) {
  final parts = <String>[];
  final category = actions['category']?.toString().trim();
  final incomeCategory = actions['incomeCategory']?.toString().trim();
  final mood = actions['mood']?.toString().trim();
  if (category != null && category.isNotEmpty) parts.add('支出分类：$category');
  if (incomeCategory != null && incomeCategory.isNotEmpty) {
    parts.add('收入分类：$incomeCategory');
  }
  if (mood != null && mood.isNotEmpty) parts.add('情绪：$mood');
  return parts.isEmpty ? '无动作' : parts.join('，');
}

class DataCenterSheet extends StatefulWidget {
  const DataCenterSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<DataCenterSheet> createState() => _DataCenterSheetState();
}

class _DataCenterSheetState extends State<DataCenterSheet> {
  late final TextEditingController restoreText;
  bool exporting = false;
  bool checkingRestore = false;
  bool restoring = false;
  bool syncing = false;
  String? exportedBackup;
  String? exportSummary;
  Map<String, dynamic>? restorePlan;

  @override
  void initState() {
    super.initState();
    restoreText = TextEditingController();
  }

  @override
  void dispose() {
    restoreText.dispose();
    super.dispose();
  }

  Future<void> _export() async {
    setState(() => exporting = true);
    try {
      final raw = await widget.controller.exportBackup();
      final decoded = jsonDecode(raw);
      final map = decoded is Map ? Map<String, dynamic>.from(decoded) : null;
      final recordCount = map == null
          ? 0
          : map.values.whereType<List>().fold<int>(
              0,
              (total, items) => total + items.length,
            );
      if (!mounted) return;
      setState(() {
        exportedBackup = raw;
        exportSummary = '已生成 v${map?['version'] ?? '?'} 备份，共 $recordCount 条记录';
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('备份已生成，可复制保存')));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('导出备份失败：$error')));
      }
    } finally {
      if (mounted) setState(() => exporting = false);
    }
  }

  Future<void> _copyBackup() async {
    final backup = exportedBackup;
    if (backup == null) return;
    await Clipboard.setData(ClipboardData(text: backup));
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('备份 JSON 已复制')));
    }
  }

  Future<void> _saveBackupFile() async {
    final backup = exportedBackup;
    if (backup == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请先生成完整备份')));
      return;
    }
    try {
      final uri = await FilePicker.saveFile(
        fileName:
            'neo-ledger-backup-${DateFormat('yyyyMMdd-HHmmss').format(DateTime.now())}.json',
        bytes: Uint8List.fromList(utf8.encode(backup)),
        mimeType: 'application/json',
      );
      if (mounted && uri != null) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('备份文件已保存')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存备份文件失败：$error')));
      }
    }
  }

  Future<void> _pickRestoreFile() async {
    try {
      final file = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: ['json', 'txt'],
      );
      if (file == null) return;
      final bytes = await file.readAsBytes();
      if (bytes.isEmpty) {
        throw const FormatException('所选文件为空');
      }
      final text = utf8.decode(bytes, allowMalformed: false);
      if (!mounted) return;
      setState(() {
        restoreText.text = text;
        restorePlan = null;
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('已载入 ${file.name}，请先预检')));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('读取备份文件失败：$error')));
      }
    }
  }

  Future<void> _preflightRestore() async {
    final raw = restoreText.text.trim();
    if (raw.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请先粘贴备份 JSON')));
      return;
    }
    setState(() => checkingRestore = true);
    try {
      final result = await widget.controller.restoreBackup(raw, dryRun: true);
      final summary = result['summary'];
      if (summary is! Map) throw const FormatException('预检响应缺少 summary');
      if (!mounted) return;
      setState(() {
        restorePlan = Map<String, dynamic>.from(summary);
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('恢复预检通过，请确认后执行')));
    } catch (error) {
      if (mounted) {
        setState(() => restorePlan = null);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('恢复预检失败：$error')));
      }
    } finally {
      if (mounted) setState(() => checkingRestore = false);
    }
  }

  Future<void> _restore() async {
    final plan = restorePlan;
    final raw = restoreText.text.trim();
    if (plan == null || raw.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('确认恢复备份？'),
        content: const Text('恢复会覆盖当前账本中的对应数据。请确认已经保存当前数据，并且预检结果来自你刚才粘贴的备份。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('确认恢复'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => restoring = true);
    try {
      final result = await widget.controller.restoreBackup(
        raw,
        dryRun: false,
        expectedPlanChecksum: plan['planChecksum']?.toString(),
      );
      if (!mounted) return;
      setState(() {
        restorePlan = null;
        restoreText.clear();
      });
      final summary = result['summary'];
      final total = summary is Map ? summary['totalRecords'] : null;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('恢复完成${total == null ? '' : '：$total 条记录'}')),
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('恢复失败：$error')));
      }
    } finally {
      if (mounted) setState(() => restoring = false);
    }
  }

  Future<void> _sync() async {
    setState(() => syncing = true);
    try {
      await widget.controller.syncQueue();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('同步完成，数据已刷新')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('同步失败：$error')));
      }
    } finally {
      if (mounted) setState(() => syncing = false);
    }
  }

  Widget _busyLabel({required bool busy, required String label}) {
    return busy
        ? const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : Text(label);
  }

  Widget _restoreSummary() {
    final plan = restorePlan;
    if (plan == null) return const SizedBox.shrink();
    final total = plan['totalRecords'] ?? 0;
    final statements = plan['estimatedStatements'] ?? 0;
    final errors = plan['errorCount'] ?? 0;
    return Card(
      color: errors == 0 ? Colors.green.withValues(alpha: 0.14) : null,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('恢复预检结果', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            _SettingRow(label: '预计处理记录', value: '$total 条'),
            _SettingRow(label: '预计数据库操作', value: '$statements 条'),
            _SettingRow(label: '校验错误', value: '$errors 条'),
            const SizedBox(height: 8),
            Text(
              errors == 0 ? '预检通过，可确认恢复。' : '存在校验错误，请修正备份后重新预检。',
              style: TextStyle(
                color: errors == 0 ? Colors.greenAccent : Colors.orangeAccent,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('数据中心', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(
              '在三端之间迁移数据、查看离线队列，并在恢复前先执行服务器校验。恢复操作会覆盖对应数据，请先保留一份当前备份。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 18),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      '备份与恢复',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: exporting ? null : _export,
                      icon: exporting
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.download_outlined),
                      label: Text(exporting ? '生成中…' : '生成完整备份'),
                    ),
                    if (exportSummary != null) ...[
                      const SizedBox(height: 8),
                      Text(exportSummary!),
                      const SizedBox(height: 8),
                      FilledButton.tonalIcon(
                        onPressed: _copyBackup,
                        icon: const Icon(Icons.copy_outlined),
                        label: const Text('复制备份 JSON'),
                      ),
                      const SizedBox(height: 8),
                      FilledButton.tonalIcon(
                        onPressed: _saveBackupFile,
                        icon: const Icon(Icons.save_alt_outlined),
                        label: const Text('保存备份文件'),
                      ),
                    ],
                    const Divider(height: 28),
                    OutlinedButton.icon(
                      onPressed: restoring || checkingRestore
                          ? null
                          : _pickRestoreFile,
                      icon: const Icon(Icons.folder_open_outlined),
                      label: const Text('选择备份 JSON 文件'),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: restoreText,
                      minLines: 5,
                      maxLines: 10,
                      keyboardType: TextInputType.multiline,
                      decoration: const InputDecoration(
                        labelText: '粘贴备份 JSON',
                        hintText: '从另一台设备复制的 neo-ledger-backup-v23.json 内容',
                        alignLabelWithHint: true,
                      ),
                      onChanged: (_) {
                        if (restorePlan != null) {
                          setState(() => restorePlan = null);
                        }
                      },
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: checkingRestore ? null : _preflightRestore,
                      icon: checkingRestore
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.fact_check_outlined),
                      label: Text(checkingRestore ? '预检中…' : '预检恢复内容'),
                    ),
                    const SizedBox(height: 10),
                    _restoreSummary(),
                    if (restorePlan != null) ...[
                      const SizedBox(height: 10),
                      FilledButton.icon(
                        onPressed: restoring ? null : _restore,
                        icon: _busyLabel(busy: restoring, label: '确认恢复'),
                        label: Text(restoring ? '恢复中…' : '确认恢复到当前账本'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: const Icon(Icons.cloud_sync_outlined),
                title: const Text('WebDAV / NAS 备份同步'),
                subtitle: const Text('使用 HTTPS 上传或下载加密备份；恢复前必须预检并确认'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  useSafeArea: true,
                  builder: (_) => WebDavSheet(controller: controller),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      '同步状态',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 10),
                    _SettingRow(
                      label: '本地待同步',
                      value: '${controller.pendingCount} 条',
                    ),
                    _SettingRow(
                      label: '服务器待处理',
                      value: '${controller.pendingServerCount} 条',
                    ),
                    _SettingRow(
                      label: '未读通知',
                      value: '${controller.unreadNotificationCount} 条',
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: syncing ? null : _sync,
                      icon: syncing
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.sync),
                      label: Text(syncing ? '同步中…' : '立即同步并刷新'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              '数据中心使用当前登录会话。部署到 NAS 或网站时，请通过 HTTPS 和统一域名访问，避免三端各自保存不同地址。',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}

class CategoryManagerSheet extends StatefulWidget {
  const CategoryManagerSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<CategoryManagerSheet> createState() => _CategoryManagerSheetState();
}

class _CategoryManagerSheetState extends State<CategoryManagerSheet> {
  bool income = false;

  List<Category> get categories =>
      (income
              ? widget.controller.incomeCategories
              : widget.controller.expenseCategories)
          .toList()
        ..sort(
          (a, b) => a.sortOrder == b.sortOrder
              ? a.name.compareTo(b.name)
              : a.sortOrder.compareTo(b.sortOrder),
        );

  Future<void> _edit([Category? existing]) async {
    if (existing?.isSystem == true) return;
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => CategoryEditorSheet(
        controller: widget.controller,
        income: income,
        existing: existing,
      ),
    );
    if (changed == true && mounted) setState(() {});
  }

  Future<void> _delete(Category item) async {
    if (item.isSystem) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除自定义分类？'),
        content: Text('删除“${item.name}”不会删除历史流水，但后续录入将不能再选择它。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await widget.controller.deleteCategory(item, income: income);
      if (mounted) setState(() {});
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('删除分类失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final items = categories;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('分类管理', style: Theme.of(context).textTheme.headlineSmall),
                IconButton(
                  tooltip: '新增分类',
                  onPressed: _edit,
                  icon: const Icon(Icons.add_circle_outline),
                ),
              ],
            ),
            Text(
              '系统分类不可修改；自定义分类会同步到当前账本的所有设备。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.35),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('支出分类'),
                  selected: !income,
                  onSelected: (_) => setState(() => income = false),
                ),
                ChoiceChip(
                  label: const Text('收入分类'),
                  selected: income,
                  onSelected: (_) => setState(() => income = true),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (items.isEmpty)
              const _EmptyState(message: '当前账本还没有分类')
            else
              Card(
                child: Column(
                  children: [
                    for (var index = 0; index < items.length; index++) ...[
                      ListTile(
                        leading: CircleAvatar(
                          backgroundColor: _parseHexColor(items[index].color),
                          child: Text(items[index].icon),
                        ),
                        title: Text(items[index].name),
                        subtitle: Text(
                          '${items[index].isSystem ? '系统分类' : '自定义分类'} · ${items[index].isActive ? '启用' : '停用'}',
                        ),
                        trailing: items[index].isSystem
                            ? const Icon(Icons.lock_outline, size: 18)
                            : Wrap(
                                spacing: 0,
                                children: [
                                  IconButton(
                                    tooltip: '编辑',
                                    onPressed: () => _edit(items[index]),
                                    icon: const Icon(Icons.edit_outlined),
                                  ),
                                  IconButton(
                                    tooltip: '删除',
                                    onPressed: () => _delete(items[index]),
                                    icon: const Icon(Icons.delete_outline),
                                  ),
                                ],
                              ),
                      ),
                      if (index != items.length - 1) const Divider(height: 1),
                    ],
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class CategoryEditorSheet extends StatefulWidget {
  const CategoryEditorSheet({
    required this.controller,
    required this.income,
    this.existing,
    super.key,
  });

  final LedgerController controller;
  final bool income;
  final Category? existing;

  @override
  State<CategoryEditorSheet> createState() => _CategoryEditorSheetState();
}

class _CategoryEditorSheetState extends State<CategoryEditorSheet> {
  late final TextEditingController name;
  late final TextEditingController icon;
  late final TextEditingController color;
  late bool isActive;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    name = TextEditingController(text: widget.existing?.name ?? '');
    icon = TextEditingController(text: widget.existing?.icon ?? '🧾');
    color = TextEditingController(text: widget.existing?.color ?? '#6B7280');
    isActive = widget.existing?.isActive ?? true;
  }

  @override
  void dispose() {
    name.dispose();
    icon.dispose();
    color.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => saving = true);
    try {
      await widget.controller.saveCategory(
        existing: widget.existing,
        income: widget.income,
        name: name.text,
        icon: icon.text,
        color: color.text,
        isActive: isActive,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存分类失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.existing == null ? '新增分类' : '编辑分类',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: name,
              autofocus: widget.existing == null,
              decoration: const InputDecoration(
                labelText: '分类名称',
                hintText: '例如：早餐、网购、工资',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: icon,
                    decoration: const InputDecoration(
                      labelText: '图标',
                      hintText: '🍜',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: color,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      labelText: '颜色',
                      hintText: '#6B7280',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
              ],
            ),
            if (widget.existing != null) ...[
              const SizedBox(height: 4),
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                title: const Text('启用分类'),
                value: isActive,
                onChanged: (value) => setState(() => isActive = value),
              ),
            ],
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: saving ? null : _save,
              icon: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(saving ? '保存中…' : '保存分类'),
            ),
          ],
        ),
      ),
    );
  }
}

class SecuritySheet extends StatefulWidget {
  const SecuritySheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<SecuritySheet> createState() => _SecuritySheetState();
}

class _SecuritySheetState extends State<SecuritySheet> {
  late String theme;
  late bool lockEnabled;
  late final TextEditingController pin;
  bool saving = false;
  bool verifying = false;
  String? verifyMessage;

  @override
  void initState() {
    super.initState();
    theme = widget.controller.preferences.theme;
    lockEnabled = widget.controller.preferences.lockEnabled;
    pin = TextEditingController();
  }

  @override
  void dispose() {
    pin.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => saving = true);
    try {
      await widget.controller.savePreferences(
        theme: theme,
        lockEnabled: lockEnabled,
        pin: pin.text,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存隐私配置失败：$error')));
      }
    }
  }

  Future<void> _verify() async {
    setState(() {
      verifying = true;
      verifyMessage = null;
    });
    try {
      final ok = await widget.controller.verifyPin(pin.text);
      if (mounted) setState(() => verifyMessage = ok ? 'PIN 验证通过' : 'PIN 不正确');
    } catch (error) {
      if (mounted) setState(() => verifyMessage = '验证失败：$error');
    } finally {
      if (mounted) setState(() => verifying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('隐私与安全', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(
              '这里配置的是服务端账本隐私锁和显示主题。当前原生端不会把“已开启”误认为本地启动拦截；本地生物识别/屏幕锁仍需单独接入系统能力。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              initialValue: theme,
              decoration: const InputDecoration(
                labelText: '主题',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'cream', child: Text('奶油绿')),
                DropdownMenuItem(value: 'dark', child: Text('深色')),
                DropdownMenuItem(value: 'light', child: Text('浅色')),
              ],
              onChanged: (value) {
                if (value != null) setState(() => theme = value);
              },
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('开启账本隐私锁'),
              subtitle: const Text('服务端会要求 PIN；不会修改支付或同步权限'),
              value: lockEnabled,
              onChanged: (value) => setState(() => lockEnabled = value),
            ),
            if (lockEnabled) ...[
              TextField(
                controller: pin,
                obscureText: true,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'PIN（首次开启必须填写）',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: verifying || pin.text.trim().isEmpty
                    ? null
                    : _verify,
                icon: verifying
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.verified_user_outlined),
                label: const Text('验证现有 PIN'),
              ),
              if (verifyMessage != null)
                Text(
                  verifyMessage!,
                  style: TextStyle(
                    color: verifyMessage == 'PIN 验证通过'
                        ? Colors.greenAccent
                        : Colors.orangeAccent,
                  ),
                ),
            ],
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: saving ? null : _save,
              icon: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(saving ? '保存中…' : '保存安全配置'),
            ),
          ],
        ),
      ),
    );
  }
}

class AiSheet extends StatefulWidget {
  const AiSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<AiSheet> createState() => _AiSheetState();
}

class _AiSheetState extends State<AiSheet> {
  late final TextEditingController message;
  bool consentExternal = false;
  bool asking = false;
  AiReply? reply;

  @override
  void initState() {
    super.initState();
    message = TextEditingController();
  }

  @override
  void dispose() {
    message.dispose();
    super.dispose();
  }

  Future<void> _ask() async {
    setState(() => asking = true);
    try {
      final result = await widget.controller.askAi(
        message.text,
        consentExternal: consentExternal,
      );
      if (mounted) setState(() => reply = result);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('AI 请求失败：$error')));
      }
    } finally {
      if (mounted) setState(() => asking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('AI 财务助手', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(
              '仅基于当前账本回答分析问题，不会自动新增、修改或删除流水，也不会替你支付。外部模型调用只有在你明确同意后才启用。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: message,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(
                labelText: '想咨询什么？',
                hintText: '例如：本月餐饮支出比上月多多少？',
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
              ),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('同意使用外部 AI 模型'),
              subtitle: const Text('关闭时只使用服务端本地规则分析'),
              value: consentExternal,
              onChanged: (value) => setState(() => consentExternal = value),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: asking ? null : _ask,
              icon: asking
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.auto_awesome),
              label: Text(asking ? '分析中…' : '开始分析'),
            ),
            if (reply != null) ...[
              const SizedBox(height: 14),
              Card(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '回答 · ${reply!.provider}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      SelectableText(reply!.answer),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class WebDavSheet extends StatefulWidget {
  const WebDavSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<WebDavSheet> createState() => _WebDavSheetState();
}

class _WebDavSheetState extends State<WebDavSheet> {
  late final TextEditingController url;
  late final TextEditingController username;
  late final TextEditingController password;
  bool syncing = false;
  String? status;
  String? downloaded;
  Map<String, dynamic>? restorePlan;

  @override
  void initState() {
    super.initState();
    url = TextEditingController();
    username = TextEditingController();
    password = TextEditingController();
  }

  @override
  void dispose() {
    url.dispose();
    username.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> _sync(String action) async {
    setState(() {
      syncing = true;
      status = null;
      if (action == 'upload') downloaded = null;
    });
    try {
      final payload = await widget.controller.syncWebDav(
        action: action,
        url: url.text,
        username: username.text,
        password: password.text,
      );
      if (!mounted) return;
      setState(() {
        downloaded = action == 'download' ? payload : null;
        status = action == 'upload' ? '当前备份已上传' : '云端备份已下载，请先预检';
        restorePlan = null;
      });
    } catch (error) {
      if (mounted) setState(() => status = '操作失败：$error');
    } finally {
      if (mounted) setState(() => syncing = false);
    }
  }

  Future<void> _copyDownloaded() async {
    final raw = downloaded;
    if (raw == null) return;
    await Clipboard.setData(ClipboardData(text: raw));
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('云端备份 JSON 已复制')));
    }
  }

  Future<void> _saveDownloaded() async {
    final raw = downloaded;
    if (raw == null) return;
    final stamp = DateTime.now()
        .toIso8601String()
        .replaceAll(RegExp(r'[^0-9]'), '')
        .substring(0, 14);
    final path = await FilePicker.saveFile(
      fileName: 'neo-ledger-webdav-$stamp.json',
      bytes: Uint8List.fromList(utf8.encode(raw)),
      mimeType: 'application/json',
    );
    if (mounted && path != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('云端备份文件已保存')));
    }
  }

  Future<void> _preflight() async {
    final raw = downloaded;
    if (raw == null || raw.trim().isEmpty) return;
    if (widget.controller.demoMode) {
      setState(() => status = '演示模式不能恢复真实账本');
      return;
    }
    try {
      final result = await widget.controller.restoreBackup(raw, dryRun: true);
      final summary = result['summary'];
      if (summary is! Map) throw const FormatException('预检响应缺少 summary');
      if (mounted) {
        setState(() {
          restorePlan = Map<String, dynamic>.from(summary);
          status = '预检通过，请确认恢复';
        });
      }
    } catch (error) {
      if (mounted) setState(() => status = '预检失败：$error');
    }
  }

  Future<void> _restore() async {
    final raw = downloaded;
    final plan = restorePlan;
    if (raw == null || plan == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('确认恢复云端备份？'),
        content: const Text('恢复会覆盖当前账本的对应数据，请确认已保留当前备份。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('确认恢复'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => syncing = true);
    try {
      await widget.controller.restoreBackup(
        raw,
        dryRun: false,
        expectedPlanChecksum: plan['planChecksum']?.toString(),
      );
      if (mounted) {
        setState(() {
          downloaded = null;
          restorePlan = null;
          status = '云端备份已恢复';
        });
      }
    } catch (error) {
      if (mounted) setState(() => status = '恢复失败：$error');
    } finally {
      if (mounted) setState(() => syncing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final plan = restorePlan;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'WebDAV / NAS',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              '用于三端共享备份。服务端只接受 HTTPS；密码只在本次请求中使用，不写入 Neo Ledger。下载后的备份必须预检，通过后才能恢复。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: url,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'WebDAV HTTPS 地址',
                hintText: 'https://dav.example.com/neo-ledger',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: username,
              decoration: const InputDecoration(
                labelText: '用户名',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: password,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: '密码 / 应用专用密码',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: FilledButton.tonalIcon(
                    onPressed: syncing ? null : () => _sync('upload'),
                    icon: const Icon(Icons.cloud_upload_outlined),
                    label: const Text('上传当前备份'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.tonalIcon(
                    onPressed: syncing ? null : () => _sync('download'),
                    icon: const Icon(Icons.cloud_download_outlined),
                    label: const Text('下载云端备份'),
                  ),
                ),
              ],
            ),
            if (status != null) ...[
              const SizedBox(height: 12),
              Text(
                status!,
                style: TextStyle(color: Colors.greenAccent.shade100),
              ),
            ],
            if (downloaded != null) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _copyDownloaded,
                icon: const Icon(Icons.copy_outlined),
                label: const Text('复制下载的备份 JSON'),
              ),
              OutlinedButton.icon(
                onPressed: _saveDownloaded,
                icon: const Icon(Icons.save_alt_outlined),
                label: const Text('保存下载的备份文件'),
              ),
              OutlinedButton.icon(
                onPressed: syncing ? null : _preflight,
                icon: const Icon(Icons.fact_check_outlined),
                label: const Text('预检下载内容'),
              ),
            ],
            if (plan != null) ...[
              const SizedBox(height: 8),
              Card(
                color: Colors.green.withValues(alpha: .14),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '预检通过',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 6),
                      _SettingRow(
                        label: '预计记录',
                        value: '${plan['totalRecords'] ?? 0} 条',
                      ),
                      _SettingRow(
                        label: '校验错误',
                        value: '${plan['errorCount'] ?? 0} 条',
                      ),
                      const SizedBox(height: 8),
                      FilledButton.icon(
                        onPressed: syncing ? null : _restore,
                        icon: const Icon(Icons.restore_outlined),
                        label: const Text('确认恢复到当前账本'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class ImportSheet extends StatefulWidget {
  const ImportSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<ImportSheet> createState() => _ImportSheetState();
}

class _ImportSheetState extends State<ImportSheet> {
  late final TextEditingController rawText;
  bool previewing = false;
  bool importing = false;
  Map<String, dynamic>? preview;
  List<Map<String, dynamic>> normalizedItems = const [];

  @override
  void initState() {
    super.initState();
    rawText = TextEditingController();
  }

  @override
  void dispose() {
    rawText.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _decodeItems() =>
      LedgerImportParser.parse(rawText.text);

  Future<void> _pickImportFile() async {
    try {
      final file = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: ['json', 'csv', 'txt'],
      );
      if (file == null) return;
      final bytes = await file.readAsBytes();
      if (bytes.isEmpty) {
        throw const FormatException('所选文件为空');
      }
      final text = utf8.decode(bytes, allowMalformed: false);
      if (!mounted) return;
      rawText.text = text;
      setState(() {
        preview = null;
        normalizedItems = const [];
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('已载入 ${file.name}，请预览并检查')));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('读取账单文件失败：$error')));
      }
    }
  }

  int _number(String key) {
    final value = preview?[key];
    return value is num ? value.toInt() : int.tryParse('$value') ?? 0;
  }

  Future<void> _preview() async {
    List<Map<String, dynamic>> items;
    try {
      items = _decodeItems();
    } catch (error) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('账单文件解析失败：$error')));
      return;
    }
    if (items.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('没有可预览的流水')));
      return;
    }
    setState(() {
      previewing = true;
      preview = null;
      normalizedItems = items;
    });
    try {
      final result = await widget.controller.previewBillImport(items);
      if (mounted) setState(() => preview = result);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('预览失败：$error')));
      }
    } finally {
      if (mounted) setState(() => previewing = false);
    }
  }

  Future<void> _import() async {
    final result = preview;
    if (result == null) return;
    if (_number('unmapped') > 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('仍有流水没有匹配账户，请补充 accountId 或 accountName 后再导入'),
        ),
      );
      return;
    }
    final items = result['items'];
    final commitItems = items is List
        ? items.whereType<Map>().map(Map<String, dynamic>.from).toList()
        : normalizedItems;
    setState(() => importing = true);
    try {
      final imported = await widget.controller.importBills(commitItems);
      if (!mounted) return;
      final count = imported['imported'] ?? commitItems.length;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('已导入 $count 条流水')));
      Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => importing = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('导入失败：$error')));
      }
    }
  }

  Widget _summaryRow(String label, int value) =>
      _SettingRow(label: label, value: '$value 条');

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final previewItems = preview?['items'] is List
        ? (preview!['items'] as List)
              .whereType<Map>()
              .map(Map<String, dynamic>.from)
              .toList()
        : normalizedItems;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('导入账单', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(
              '支持 Web 导出的 transactions JSON、通用 JSON 流水数组和 CSV 文件。预览会先识别重复项和账户映射，确认后才写入当前账本。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: previewing || importing ? null : _pickImportFile,
              icon: const Icon(Icons.folder_open_outlined),
              label: const Text('选择 JSON / CSV 文件'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: rawText,
              minLines: 8,
              maxLines: 16,
              keyboardType: TextInputType.multiline,
              decoration: const InputDecoration(
                labelText: '流水 JSON / CSV（也可粘贴）',
                hintText: '[{"occurredAt":"2026-08-27 12:00:00","merchant":"午餐","amount":25.5,"type":"支出","source":"generic","accountName":"现金"}]',
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
              ),
              onChanged: (_) {
                if (preview != null) setState(() => preview = null);
              },
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: previewing ? null : _preview,
              icon: previewing
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.fact_check_outlined),
              label: Text(previewing ? '预览中…' : '预览并检查'),
            ),
            if (preview != null) ...[
              const SizedBox(height: 12),
              Card(
                color: _number('unmapped') == 0
                    ? Colors.green.withValues(alpha: .14)
                    : Colors.orange.withValues(alpha: .12),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        '预览结果',
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      _summaryRow('识别流水', _number('detected')),
                      _summaryRow('重复跳过', _number('duplicates')),
                      _summaryRow('疑似重复', _number('possibleDuplicates')),
                      _summaryRow('未匹配账户', _number('unmapped')),
                      _summaryRow('无法识别', _number('unconfirmed')),
                      if (_number('unmapped') > 0) ...[
                        const SizedBox(height: 8),
                        Text(
                          '导入被保护性阻止：请给每条流水填写 accountId 或 accountName，避免金额落到错误账户。',
                          style: TextStyle(color: Colors.orange.shade200),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),
              ...previewItems
                  .take(5)
                  .map(
                    (item) => ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        item['type'] == '收入'
                            ? Icons.south_west
                            : Icons.north_east,
                      ),
                      title: Text('${item['merchant'] ?? '未命名'}'),
                      subtitle: Text(
                        '${item['occurredAt'] ?? ''} · ${item['accountName'] ?? item['paymentMethod'] ?? '待匹配账户'}',
                      ),
                      trailing: Text('¥${item['amount'] ?? '-'}'),
                    ),
                  ),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: importing || _number('unmapped') > 0
                    ? null
                    : _import,
                icon: importing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.download_done_outlined),
                label: Text(importing ? '导入中…' : '确认导入'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class SettlementSheet extends StatefulWidget {
  const SettlementSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<SettlementSheet> createState() => _SettlementSheetState();
}

class _SettlementSheetState extends State<SettlementSheet> {
  late final TextEditingController name;
  late final TextEditingController icon;
  late final TextEditingController amount;
  Member? selectedMember;
  String direction = 'owesMe';
  bool saving = false;
  bool addingMember = false;

  @override
  void initState() {
    super.initState();
    name = TextEditingController();
    icon = TextEditingController(text: '👤');
    amount = TextEditingController();
    final partners = widget.controller.members.where((item) => !item.isMe);
    selectedMember = partners.isEmpty ? null : partners.first;
  }

  @override
  void dispose() {
    name.dispose();
    icon.dispose();
    amount.dispose();
    super.dispose();
  }

  List<Member> get partners =>
      widget.controller.members.where((item) => !item.isMe).toList();

  Future<void> _addMember() async {
    if (name.text.trim().isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请先填写参与人名称')));
      return;
    }
    setState(() => addingMember = true);
    try {
      await widget.controller.addMember(name: name.text, icon: icon.text);
      if (!mounted) return;
      final matched = partners.where((item) => item.name == name.text.trim());
      setState(() {
        selectedMember = matched.isEmpty ? null : matched.last;
        name.clear();
        addingMember = false;
      });
    } catch (error) {
      if (mounted) {
        setState(() => addingMember = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('添加参与人失败：$error')));
      }
    }
  }

  Future<void> _save() async {
    final value = double.tryParse(amount.text.trim());
    if (selectedMember == null || value == null || value <= 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请选择参与人并填写大于 0 的金额')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.controller.settleMember(
        member: selectedMember!,
        amount: value,
        direction: direction,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('结算失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final availablePartners = partners;
    final selected = availablePartners.contains(selectedMember)
        ? selectedMember
        : null;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('分账与结算', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(
              '结算会形成一笔明确的收入或支出流水，并保留参与人信息。不会修改历史原始账单。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 16),
            if (availablePartners.isEmpty)
              const _EmptyState(message: '还没有其他参与人，请先在下方添加')
            else
              DropdownButtonFormField<Member>(
                initialValue: selected,
                decoration: const InputDecoration(
                  labelText: '参与人',
                  border: OutlineInputBorder(),
                ),
                items: availablePartners
                    .map(
                      (item) => DropdownMenuItem<Member>(
                        value: item,
                        child: Text('${item.icon} ${item.name}'),
                      ),
                    )
                    .toList(),
                onChanged: (value) => setState(() => selectedMember = value),
              ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextField(
                    controller: name,
                    decoration: const InputDecoration(
                      labelText: '新增参与人',
                      hintText: '例如：小明',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  height: 56,
                  child: FilledButton.tonal(
                    onPressed: addingMember ? null : _addMember,
                    child: Text(addingMember ? '添加中…' : '添加'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: amount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: '结算金额',
                prefixText: '¥ ',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: direction,
              decoration: const InputDecoration(
                labelText: '结算方向',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'owesMe', child: Text('对方还我（记为收入）')),
                DropdownMenuItem(value: 'iOwe', child: Text('我还对方（记为支出）')),
              ],
              onChanged: (value) {
                if (value != null) setState(() => direction = value);
              },
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: saving || selected == null ? null : _save,
              icon: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.check),
              label: Text(saving ? '保存中…' : '确认结算'),
            ),
          ],
        ),
      ),
    );
  }
}

class FinanceSettingsSheet extends StatefulWidget {
  const FinanceSettingsSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<FinanceSettingsSheet> createState() => _FinanceSettingsSheetState();
}

class _FinanceSettingsSheetState extends State<FinanceSettingsSheet> {
  late final TextEditingController monthlyExpense;
  late final TextEditingController annualReturn;
  late final TextEditingController inflationRate;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    monthlyExpense = TextEditingController(
      text: widget.controller.monthlyExpense?.toStringAsFixed(2) ?? '10000',
    );
    annualReturn = TextEditingController(
      text: widget.controller.annualReturn?.toStringAsFixed(2) ?? '4',
    );
    inflationRate = TextEditingController(
      text: widget.controller.inflationRate?.toStringAsFixed(2) ?? '3',
    );
  }

  @override
  void dispose() {
    monthlyExpense.dispose();
    annualReturn.dispose();
    inflationRate.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final monthly = double.tryParse(monthlyExpense.text.trim());
    final annual = double.tryParse(annualReturn.text.trim());
    final inflation = double.tryParse(inflationRate.text.trim());
    if (monthly == null || annual == null || inflation == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请填写三个有效数字')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.controller.saveFinancialSettings(
        monthlyExpense: monthly,
        annualReturn: annual,
        inflationRate: inflation,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存财务参数失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'FIRE 与经济参数',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              '这些参数只影响预测和分析，不会修改已有流水。服务端账本会保存，换设备后可继续使用。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: monthlyExpense,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: '月度支出基准',
                prefixText: '¥ ',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: annualReturn,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: '预期年化收益率',
                suffixText: '%',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: inflationRate,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: '通胀率',
                suffixText: '%',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: saving ? null : _save,
              icon: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(saving ? '保存中…' : '保存参数'),
            ),
          ],
        ),
      ),
    );
  }
}

class BudgetSheet extends StatefulWidget {
  const BudgetSheet({required this.controller, this.existing, super.key});

  final LedgerController controller;
  final CategoryBudget? existing;

  @override
  State<BudgetSheet> createState() => _BudgetSheetState();
}

class _BudgetSheetState extends State<BudgetSheet> {
  late final TextEditingController category;
  late final TextEditingController amount;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    category = TextEditingController(text: widget.existing?.category ?? '');
    amount = TextEditingController(
      text: widget.existing == null
          ? ''
          : (widget.existing!.amountCents / 100).toStringAsFixed(2),
    );
  }

  @override
  void dispose() {
    category.dispose();
    amount.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final parsed = double.tryParse(amount.text.trim());
    if (category.text.trim().isEmpty || parsed == null || parsed <= 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请填写分类和大于 0 的预算金额')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.controller.saveBudget(
        category: category.text,
        amount: parsed,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存预算失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.existing == null ? '新增分类预算' : '编辑分类预算',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: category,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: '分类名称',
                hintText: '例如：餐饮、交通、购物',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: amount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: '预算金额',
                prefixText: '¥ ',
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '预算按当前账本保存，流水分类相同时会自动计算已用金额。',
              style: TextStyle(color: Colors.grey.shade500),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: saving ? null : _save,
              icon: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(saving ? '保存中…' : '保存预算'),
            ),
          ],
        ),
      ),
    );
  }
}

class AssetSheet extends StatefulWidget {
  const AssetSheet({required this.controller, this.existing, super.key});

  final LedgerController controller;
  final DigitalAsset? existing;

  @override
  State<AssetSheet> createState() => _AssetSheetState();
}

class _AssetSheetState extends State<AssetSheet> {
  late final TextEditingController name;
  late final TextEditingController purchasePrice;
  late final TextEditingController manualValue;
  late final TextEditingController purchaseDate;
  late final TextEditingController lifespanMonths;
  late final TextEditingController residualRate;
  late String assetType;
  late String currency;
  late String valuationMode;
  bool saving = false;

  static const currencies = ['CNY', 'USD', 'JPY', 'EUR'];
  static const valuationModes = ['手动估值', '自动折旧'];

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    name = TextEditingController(text: existing?.name ?? '');
    purchasePrice = TextEditingController(
      text: existing == null
          ? ''
          : (existing.purchasePriceCents / 100).toStringAsFixed(2),
    );
    manualValue = TextEditingController(
      text: existing == null
          ? ''
          : ((existing.currentValueCents ?? existing.valueCents) / 100)
                .toStringAsFixed(2),
    );
    purchaseDate = TextEditingController(
      text:
          existing?.purchaseDate ??
          DateFormat('yyyy-MM-dd').format(DateTime.now()),
    );
    lifespanMonths = TextEditingController(
      text: '${existing?.lifespanMonths ?? 120}',
    );
    residualRate = TextEditingController(
      text: (existing?.residualRate ?? 0).toStringAsFixed(1),
    );
    assetType = _assetTypes.contains(existing?.assetType)
        ? existing!.assetType
        : _assetTypes.last;
    currency = currencies.contains(existing?.currency)
        ? existing!.currency
        : currencies.first;
    valuationMode = valuationModes.contains(existing?.valuationMode)
        ? existing!.valuationMode!
        : valuationModes.first;
  }

  @override
  void dispose() {
    name.dispose();
    purchasePrice.dispose();
    manualValue.dispose();
    purchaseDate.dispose();
    lifespanMonths.dispose();
    residualRate.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final initial = DateTime.tryParse(purchaseDate.text) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(1970),
      lastDate: DateTime.now(),
      initialDate: initial.isAfter(DateTime.now()) ? DateTime.now() : initial,
    );
    if (picked == null) return;
    purchaseDate.text = DateFormat('yyyy-MM-dd').format(picked);
    setState(() {});
  }

  Future<void> _save() async {
    final purchase = double.tryParse(purchasePrice.text.trim());
    final current = double.tryParse(manualValue.text.trim());
    final lifespan = int.tryParse(lifespanMonths.text.trim());
    final residual = double.tryParse(residualRate.text.trim());
    if (name.text.trim().isEmpty || purchase == null || purchase <= 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请填写资产名称和大于 0 的购入原值')));
      return;
    }
    if (valuationMode == '手动估值' && (current == null || current < 0)) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请填写不小于 0 的当前估值')));
      return;
    }
    if (valuationMode == '自动折旧' &&
        (lifespan == null || lifespan < 1 || lifespan > 1200)) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('折旧年限需为 1～1200 个月')));
      return;
    }
    if (residual == null || residual < 0 || residual > 100) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('残值率需在 0～100% 之间')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.controller.saveAsset(
        existing: widget.existing,
        name: name.text,
        assetType: assetType,
        currency: currency,
        valuationMode: valuationMode,
        manualValue: current ?? 0,
        purchasePrice: purchase,
        purchaseDate: purchaseDate.text,
        lifespanMonths: lifespan ?? 120,
        residualRate: residual,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存资产失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.existing == null ? '新增数字资产' : '编辑数字资产',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: name,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: '资产名称',
                hintText: '例如：相机、车辆、收藏品',
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: assetType,
              decoration: const InputDecoration(labelText: '资产类型'),
              items: _assetTypes
                  .map(
                    (item) => DropdownMenuItem(value: item, child: Text(item)),
                  )
                  .toList(),
              onChanged: saving
                  ? null
                  : (value) => setState(() => assetType = value!),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: currency,
                    decoration: const InputDecoration(labelText: '币种'),
                    items: currencies
                        .map(
                          (item) =>
                              DropdownMenuItem(value: item, child: Text(item)),
                        )
                        .toList(),
                    onChanged: saving
                        ? null
                        : (value) => setState(() => currency = value!),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: valuationMode,
                    decoration: const InputDecoration(labelText: '估值方式'),
                    items: valuationModes
                        .map(
                          (item) =>
                              DropdownMenuItem(value: item, child: Text(item)),
                        )
                        .toList(),
                    onChanged: saving
                        ? null
                        : (value) => setState(() => valuationMode = value!),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: purchasePrice,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: '购入原值',
                prefixText: '¥ ',
              ),
            ),
            if (valuationMode == '手动估值') ...[
              const SizedBox(height: 12),
              TextField(
                controller: manualValue,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: '当前估值',
                  prefixText: '¥ ',
                ),
              ),
            ],
            if (valuationMode == '自动折旧') ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: lifespanMonths,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: '折旧年限（月）'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: residualRate,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(labelText: '残值率（%）'),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: purchaseDate,
              readOnly: true,
              onTap: _pickDate,
              decoration: const InputDecoration(
                labelText: '购入日期',
                suffixIcon: Icon(Icons.calendar_today_outlined),
              ),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: saving ? null : _save,
              icon: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(saving ? '保存中…' : '保存资产'),
            ),
          ],
        ),
      ),
    );
  }
}

class TransferSheet extends StatefulWidget {
  const TransferSheet({required this.controller, this.initialFrom, super.key});

  final LedgerController controller;
  final Account? initialFrom;

  @override
  State<TransferSheet> createState() => _TransferSheetState();
}

class _TransferSheetState extends State<TransferSheet> {
  late final TextEditingController amount;
  late final TextEditingController note;
  late String kind;
  int? fromAccountId;
  int? toAccountId;
  bool saving = false;

  List<Account> get sourceAccounts => widget.controller.accounts
      .where((item) => item.type == '资产')
      .toList(growable: false);

  List<Account> get destinationAccounts => widget.controller.accounts
      .where(
        (item) =>
            item.type == (kind == '信用卡还款' ? '负债' : '资产') &&
            item.id != fromAccountId,
      )
      .toList(growable: false);

  @override
  void initState() {
    super.initState();
    amount = TextEditingController();
    note = TextEditingController();
    kind = '账户转账';
    final preferred = widget.initialFrom;
    fromAccountId = sourceAccounts
        .where((item) => item.id == preferred?.id)
        .firstOrNull
        ?.id;
    fromAccountId ??= sourceAccounts.firstOrNull?.id;
    toAccountId = destinationAccounts.firstOrNull?.id;
  }

  @override
  void dispose() {
    amount.dispose();
    note.dispose();
    super.dispose();
  }

  void _setKind(String value) {
    setState(() {
      kind = value;
      toAccountId = destinationAccounts.firstOrNull?.id;
    });
  }

  Future<void> _submit() async {
    final parsedAmount = double.tryParse(amount.text.trim());
    if (fromAccountId == null || toAccountId == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请先准备可用的转出和转入账户')));
      return;
    }
    if (parsedAmount == null || !parsedAmount.isFinite || parsedAmount <= 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请输入大于 0 的金额')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.controller.transfer(
        kind: kind,
        fromAccountId: fromAccountId!,
        toAccountId: toAccountId!,
        amount: parsedAmount,
        note: note.text.trim().isEmpty ? null : note.text.trim(),
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('提交失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final destinations = destinationAccounts;
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('转账/还款', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(
              '转账只改变账户余额，不会伪造消费流水；信用卡还款会将金额转入负债账户。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 18),
            DropdownButtonFormField<String>(
              initialValue: kind,
              decoration: const InputDecoration(labelText: '操作类型'),
              items: const [
                DropdownMenuItem(value: '账户转账', child: Text('账户转账')),
                DropdownMenuItem(value: '信用卡还款', child: Text('信用卡还款')),
              ],
              onChanged: saving ? null : (value) => _setKind(value!),
            ),
            const SizedBox(height: 12),
            if (sourceAccounts.isEmpty)
              const _EmptyState(message: '暂无资产账户，请先新增一个资产账户')
            else ...[
              DropdownButtonFormField<int>(
                initialValue: fromAccountId,
                decoration: const InputDecoration(labelText: '转出账户'),
                items: sourceAccounts
                    .map(
                      (item) => DropdownMenuItem(
                        value: item.id,
                        child: Text(
                          '${item.name} · ${_money(item.balanceCents)}',
                        ),
                      ),
                    )
                    .toList(),
                onChanged: saving
                    ? null
                    : (value) => setState(() {
                        fromAccountId = value;
                        if (toAccountId == value) {
                          toAccountId = destinationAccounts.firstOrNull?.id;
                        }
                      }),
              ),
              const SizedBox(height: 12),
              if (destinations.isEmpty)
                Text(
                  kind == '信用卡还款' ? '暂无可还款的负债账户' : '暂无可转入的其他资产账户',
                  style: TextStyle(color: Colors.orange.shade300),
                )
              else
                DropdownButtonFormField<int>(
                  initialValue: toAccountId,
                  decoration: InputDecoration(
                    labelText: kind == '信用卡还款' ? '还款账户' : '转入账户',
                  ),
                  items: destinations
                      .map(
                        (item) => DropdownMenuItem(
                          value: item.id,
                          child: Text(
                            '${item.name} · ${_money(item.balanceCents)}',
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: saving
                      ? null
                      : (value) => setState(() => toAccountId = value),
                ),
              const SizedBox(height: 12),
              TextField(
                controller: amount,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: '金额',
                  prefixText: '¥ ',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: note,
                maxLength: 120,
                decoration: const InputDecoration(
                  labelText: '备注（可选）',
                  hintText: '例如：本月信用卡还款',
                ),
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: saving || destinations.isEmpty ? null : _submit,
                icon: saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.swap_horiz),
                label: Text(
                  saving
                      ? '提交中…'
                      : kind == '信用卡还款'
                      ? '确认还款'
                      : '确认转账',
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class AssetLiquidationSheet extends StatefulWidget {
  const AssetLiquidationSheet({
    required this.controller,
    required this.asset,
    super.key,
  });

  final LedgerController controller;
  final DigitalAsset asset;

  @override
  State<AssetLiquidationSheet> createState() => _AssetLiquidationSheetState();
}

class _AssetLiquidationSheetState extends State<AssetLiquidationSheet> {
  late final TextEditingController salePrice;
  int? accountId;
  bool saving = false;

  List<Account> get eligibleAccounts => widget.controller.accounts
      .where(
        (item) => item.type == '资产' && item.currency == widget.asset.currency,
      )
      .toList(growable: false);

  @override
  void initState() {
    super.initState();
    salePrice = TextEditingController();
    accountId = eligibleAccounts.firstOrNull?.id;
  }

  @override
  void dispose() {
    salePrice.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final parsedPrice = double.tryParse(salePrice.text.trim());
    if (parsedPrice == null || !parsedPrice.isFinite || parsedPrice < 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请输入不小于 0 的变现金额')));
      return;
    }
    if (parsedPrice > 0 && accountId == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('有收入时必须选择入账账户')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.controller.liquidateAsset(
        asset: widget.asset,
        salePrice: parsedPrice,
        accountId: accountId ?? 0,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('处理资产失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final accounts = eligibleAccounts;
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 8, 20, bottom + 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('变现/注销资产', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(
              '当前资产：${widget.asset.name}。金额填 0 仅注销资产；填入售价会生成“二手变现”收入并入账。',
              style: TextStyle(color: Colors.grey.shade500, height: 1.4),
            ),
            const SizedBox(height: 18),
            TextField(
              controller: salePrice,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(
                labelText: '变现金额（${widget.asset.currency}）',
                prefixText: '${widget.asset.currency} ',
              ),
            ),
            const SizedBox(height: 12),
            if (accounts.isEmpty)
              Text(
                '当前账本没有 ${widget.asset.currency} 资产账户；注销资产可直接提交，有收入时请先新建账户。',
                style: TextStyle(color: Colors.orange.shade300),
              )
            else
              DropdownButtonFormField<int>(
                initialValue: accountId,
                decoration: const InputDecoration(labelText: '收入账户'),
                items: accounts
                    .map(
                      (item) => DropdownMenuItem(
                        value: item.id,
                        child: Text(
                          '${item.name} · ${_money(item.balanceCents)}',
                        ),
                      ),
                    )
                    .toList(),
                onChanged: saving
                    ? null
                    : (value) => setState(() => accountId = value),
              ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: saving ? null : _submit,
              icon: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.sell_outlined),
              label: Text(saving ? '处理中…' : '确认变现并移除资产'),
            ),
          ],
        ),
      ),
    );
  }
}

class SubscriptionSheet extends StatefulWidget {
  const SubscriptionSheet({required this.controller, this.existing, super.key});

  final LedgerController controller;
  final Subscription? existing;

  @override
  State<SubscriptionSheet> createState() => _SubscriptionSheetState();
}

class _SubscriptionSheetState extends State<SubscriptionSheet> {
  late final TextEditingController name;
  late final TextEditingController amount;
  late final TextEditingController category;
  late final TextEditingController nextChargeDate;
  late String cycle;
  int? accountId;
  bool saving = false;

  List<Account> get accounts => widget.controller.accounts
      .where((item) => item.type == '资产')
      .toList(growable: false);

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    name = TextEditingController(text: existing?.name ?? '');
    amount = TextEditingController(
      text: existing == null
          ? ''
          : (existing.amountCents / 100).toStringAsFixed(2),
    );
    category = TextEditingController(text: existing?.category ?? '订阅');
    nextChargeDate = TextEditingController(
      text:
          existing?.nextChargeDate ??
          DateFormat('yyyy-MM-dd').format(DateTime.now()),
    );
    cycle = const ['每月', '每季', '每年'].contains(existing?.cycle)
        ? existing!.cycle
        : '每月';
    final available = accounts;
    accountId = available.any((item) => item.id == existing?.accountId)
        ? existing!.accountId
        : available.firstOrNull?.id;
  }

  @override
  void dispose() {
    name.dispose();
    amount.dispose();
    category.dispose();
    nextChargeDate.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final initial = DateTime.tryParse(nextChargeDate.text) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(1970),
      lastDate: DateTime(2100),
      initialDate: initial,
    );
    if (picked == null) return;
    nextChargeDate.text = DateFormat('yyyy-MM-dd').format(picked);
    setState(() {});
  }

  Future<void> _save() async {
    final parsedAmount = double.tryParse(amount.text.trim());
    if (name.text.trim().isEmpty || parsedAmount == null || parsedAmount <= 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请填写订阅名称和大于 0 的金额')));
      return;
    }
    if (accountId == null || accounts.every((item) => item.id != accountId)) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请选择资产扣款账户')));
      return;
    }
    if (category.text.trim().isEmpty ||
        DateTime.tryParse(nextChargeDate.text.trim()) == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请填写分类和有效的下次扣款日期')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.controller.saveSubscription(
        existing: widget.existing,
        name: name.text,
        amount: parsedAmount,
        accountId: accountId!,
        cycle: cycle,
        category: category.text,
        nextChargeDate: nextChargeDate.text,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存订阅失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final available = accounts;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.existing == null ? '新增固定订阅' : '编辑固定订阅',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: name,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: '订阅名称'),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: amount,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: const InputDecoration(
                      labelText: '金额',
                      prefixText: '¥ ',
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: cycle,
                    decoration: const InputDecoration(labelText: '周期'),
                    items: const ['每月', '每季', '每年']
                        .map(
                          (value) => DropdownMenuItem(
                            value: value,
                            child: Text(value),
                          ),
                        )
                        .toList(),
                    onChanged: saving
                        ? null
                        : (value) => setState(() => cycle = value ?? '每月'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<int>(
              initialValue: accountId,
              decoration: const InputDecoration(labelText: '扣款账户'),
              items: available
                  .map(
                    (item) => DropdownMenuItem(
                      value: item.id,
                      child: Text('${item.icon} ${item.name}'),
                    ),
                  )
                  .toList(),
              onChanged: saving
                  ? null
                  : (value) => setState(() => accountId = value),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: category,
              decoration: const InputDecoration(labelText: '记账分类'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: nextChargeDate,
              readOnly: true,
              onTap: _pickDate,
              decoration: const InputDecoration(
                labelText: '下次扣款日期',
                suffixIcon: Icon(Icons.calendar_today_outlined),
              ),
            ),
            if (available.isEmpty) ...[
              const SizedBox(height: 10),
              const Text('当前账本没有资产账户，请先在资产页添加账户。'),
            ],
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: saving ? null : _save,
              icon: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(saving ? '保存中…' : '保存订阅'),
            ),
          ],
        ),
      ),
    );
  }
}

class InstallmentSheet extends StatefulWidget {
  const InstallmentSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<InstallmentSheet> createState() => _InstallmentSheetState();
}

class _InstallmentSheetState extends State<InstallmentSheet> {
  late final TextEditingController name;
  late final TextEditingController totalAmount;
  late final TextEditingController periods;
  late final TextEditingController feeAmount;
  late final TextEditingController startMonth;
  late final TextEditingController chargeDay;
  int? accountId;
  int? paymentAccountId;
  bool saving = false;

  List<Account> get liabilities => widget.controller.accounts
      .where((item) => item.type == '负债')
      .toList(growable: false);

  List<Account> get payments => widget.controller.accounts
      .where((item) => item.type == '资产')
      .toList(growable: false);

  @override
  void initState() {
    super.initState();
    name = TextEditingController();
    totalAmount = TextEditingController();
    periods = TextEditingController(text: '12');
    feeAmount = TextEditingController(text: '0');
    startMonth = TextEditingController(
      text: DateFormat('yyyy-MM').format(DateTime.now()),
    );
    chargeDay = TextEditingController(text: '${DateTime.now().day}');
    accountId = liabilities.firstOrNull?.id;
    paymentAccountId = payments.firstOrNull?.id;
  }

  @override
  void dispose() {
    name.dispose();
    totalAmount.dispose();
    periods.dispose();
    feeAmount.dispose();
    startMonth.dispose();
    chargeDay.dispose();
    super.dispose();
  }

  Future<void> _pickMonth() async {
    final parsed = DateTime.tryParse('${startMonth.text}-01') ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(1970),
      lastDate: DateTime(2100),
      initialDate: parsed,
    );
    if (picked == null) return;
    startMonth.text = DateFormat('yyyy-MM').format(picked);
    setState(() {});
  }

  Future<void> _save() async {
    final total = double.tryParse(totalAmount.text.trim());
    final count = int.tryParse(periods.text.trim());
    final fee = double.tryParse(feeAmount.text.trim());
    final day = int.tryParse(chargeDay.text.trim());
    if (name.text.trim().isEmpty || total == null || total <= 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请填写分期名称和大于 0 的总金额')));
      return;
    }
    if (count == null || count < 1 || count > 360 || fee == null || fee < 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('期数需为 1～360，手续费不能小于 0')));
      return;
    }
    if (day == null || day < 1 || day > 31) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('扣款日需为 1～31')));
      return;
    }
    if (!RegExp(r'^\d{4}-(0[1-9]|1[0-2])$').hasMatch(startMonth.text.trim())) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('开始月份格式应为 YYYY-MM')));
      return;
    }
    if (accountId == null || paymentAccountId == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请选择负债账户和付款账户')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.controller.createInstallment(
        name: name.text,
        totalAmount: total,
        periods: count,
        feeAmount: fee,
        accountId: accountId!,
        paymentAccountId: paymentAccountId!,
        startMonth: startMonth.text,
        chargeDay: day,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存分期失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              '新增分期计划',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: name,
              decoration: const InputDecoration(labelText: '分期名称'),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: totalAmount,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: const InputDecoration(
                      labelText: '总金额',
                      prefixText: '¥ ',
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: periods,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: '期数'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: feeAmount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: '手续费',
                prefixText: '¥ ',
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<int>(
              initialValue: accountId,
              decoration: const InputDecoration(labelText: '分期负债账户'),
              items: liabilities
                  .map(
                    (item) => DropdownMenuItem(
                      value: item.id,
                      child: Text('${item.icon} ${item.name}'),
                    ),
                  )
                  .toList(),
              onChanged: saving
                  ? null
                  : (value) => setState(() => accountId = value),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<int>(
              initialValue: paymentAccountId,
              decoration: const InputDecoration(labelText: '付款资产账户'),
              items: payments
                  .map(
                    (item) => DropdownMenuItem(
                      value: item.id,
                      child: Text('${item.icon} ${item.name}'),
                    ),
                  )
                  .toList(),
              onChanged: saving
                  ? null
                  : (value) => setState(() => paymentAccountId = value),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: startMonth,
                    readOnly: true,
                    onTap: _pickMonth,
                    decoration: const InputDecoration(
                      labelText: '开始月份',
                      suffixIcon: Icon(Icons.calendar_month_outlined),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: chargeDay,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: '每月扣款日'),
                  ),
                ),
              ],
            ),
            if (liabilities.isEmpty || payments.isEmpty) ...[
              const SizedBox(height: 10),
              const Text('分期需要至少一个负债账户和一个资产账户，且币种必须一致。'),
            ],
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: saving ? null : _save,
              icon: saving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(saving ? '保存中…' : '保存分期'),
            ),
          ],
        ),
      ),
    );
  }
}

class SavingsGoalSheet extends StatefulWidget {
  const SavingsGoalSheet({required this.controller, this.existing, super.key});

  final LedgerController controller;
  final SavingsGoal? existing;

  @override
  State<SavingsGoalSheet> createState() => _SavingsGoalSheetState();
}

class _SavingsGoalSheetState extends State<SavingsGoalSheet> {
  late final TextEditingController name;
  late final TextEditingController targetAmount;
  late final TextEditingController deadline;
  late final TextEditingController icon;
  late final TextEditingController contribution;
  int? accountId;
  bool saving = false;

  List<Account> get accounts => widget.controller.accounts
      .where((item) => item.type == '资产')
      .toList(growable: false);

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    name = TextEditingController(text: existing?.name ?? '');
    targetAmount = TextEditingController(
      text: existing == null
          ? ''
          : (existing.targetAmountCents / 100).toStringAsFixed(2),
    );
    deadline = TextEditingController(
      text:
          existing?.deadline ??
          DateFormat('yyyy-MM-dd')
              .format(DateTime.now().add(const Duration(days: 30))),
    );
    icon = TextEditingController(text: existing?.icon ?? '🎯');
    contribution = TextEditingController();
    accountId = accounts.firstOrNull?.id;
  }

  @override
  void dispose() {
    name.dispose();
    targetAmount.dispose();
    deadline.dispose();
    icon.dispose();
    contribution.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final initial = DateTime.tryParse(deadline.text) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime.now(),
      lastDate: DateTime(2100),
      initialDate: initial.isBefore(DateTime.now()) ? DateTime.now() : initial,
    );
    if (picked == null) return;
    deadline.text = DateFormat('yyyy-MM-dd').format(picked);
    setState(() {});
  }

  Future<void> _create() async {
    final target = double.tryParse(targetAmount.text.trim());
    if (name.text.trim().isEmpty || target == null || target <= 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请填写目标名称和大于 0 的目标金额')));
      return;
    }
    if (DateTime.tryParse(deadline.text.trim()) == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请选择有效的目标日期')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.controller.createSavingsGoal(
        name: name.text,
        targetAmount: target,
        deadline: deadline.text,
        icon: icon.text,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存储蓄目标失败：$error')));
      }
    }
  }

  Future<void> _contribute() async {
    final amount = double.tryParse(contribution.text.trim());
    if (amount == null || amount <= 0 || accountId == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请选择资产账户并填写存入金额')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.controller.contributeSavingsGoal(
        widget.existing!,
        accountId: accountId!,
        amount: amount,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('存入储蓄目标失败：$error')));
      }
    }
  }

  Future<void> _delete() async {
    final goal = widget.existing!;
    final refundAccount = goal.savedAmountCents > 0 ? accountId : 0;
    if (goal.savedAmountCents > 0 && refundAccount == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('删除前请选择用于退回余额的资产账户')));
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除储蓄目标？'),
        content: Text(
          goal.savedAmountCents > 0 ? '已存入金额会退回所选资产账户。' : '该目标尚未存入金额。',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('删除并处理余额'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => saving = true);
    try {
      await widget.controller.deleteSavingsGoal(
        goal,
        accountId: refundAccount ?? 0,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('删除储蓄目标失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final existing = widget.existing;
    final available = accounts;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              existing == null ? '新增储蓄目标' : '管理储蓄目标',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 16),
            if (existing == null) ...[
              TextField(
                controller: name,
                decoration: const InputDecoration(labelText: '目标名称'),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: targetAmount,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(
                        labelText: '目标金额',
                        prefixText: '¥ ',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: icon,
                      decoration: const InputDecoration(labelText: '图标'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: deadline,
                readOnly: true,
                onTap: _pickDate,
                decoration: const InputDecoration(
                  labelText: '目标日期',
                  suffixIcon: Icon(Icons.calendar_today_outlined),
                ),
              ),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: saving ? null : _create,
                icon: saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.save_outlined),
                label: Text(saving ? '保存中…' : '保存目标'),
              ),
            ] else ...[
              Text(
                '${existing.icon ?? '🎯'} ${existing.name}',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              LinearProgressIndicator(
                value: existing.progress,
                minHeight: 8,
                borderRadius: BorderRadius.circular(8),
                color: _brand,
              ),
              const SizedBox(height: 8),
              Text(
                '${_money(existing.savedAmountCents)} / ${_money(existing.targetAmountCents)}',
              ),
              const SizedBox(height: 16),
              TextField(
                controller: contribution,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: '本次存入金额',
                  prefixText: '¥ ',
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<int>(
                initialValue: accountId,
                decoration: const InputDecoration(labelText: '资产账户'),
                items: available
                    .map(
                      (item) => DropdownMenuItem(
                        value: item.id,
                        child: Text('${item.icon} ${item.name}'),
                      ),
                    )
                    .toList(),
                onChanged: saving
                    ? null
                    : (value) => setState(() => accountId = value),
              ),
              if (available.isEmpty) ...[
                const SizedBox(height: 10),
                const Text('当前账本没有资产账户。'),
              ],
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: saving ? null : _contribute,
                icon: const Icon(Icons.savings_outlined),
                label: Text(saving ? '处理中…' : '存入目标'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: saving ? null : _delete,
                icon: const Icon(Icons.delete_outline),
                label: const Text('删除目标'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class EntrySheet extends StatefulWidget {
  const EntrySheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<EntrySheet> createState() => _EntrySheetState();
}

class _EntrySheetState extends State<EntrySheet> {
  final amount = TextEditingController();
  final title = TextEditingController();
  final category = TextEditingController(text: '餐饮');
  String type = '支出';
  bool saving = false;

  @override
  void dispose() {
    amount.dispose();
    title.dispose();
    category.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, bottom + 24),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              '记一笔',
              style: TextStyle(fontSize: 25, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(
                  value: '支出',
                  label: Text('支出'),
                  icon: Icon(Icons.north_east),
                ),
                ButtonSegment(
                  value: '收入',
                  label: Text('收入'),
                  icon: Icon(Icons.south_west),
                ),
              ],
              selected: {type},
              onSelectionChanged: (value) => setState(() => type = value.first),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: amount,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: '金额',
                prefixText: '¥ ',
                hintText: '0.00',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: title,
              decoration: const InputDecoration(
                labelText: '项目',
                hintText: '例如：午餐、工资',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: category,
              decoration: const InputDecoration(labelText: '分类'),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: saving ? null : _save,
              icon: const Icon(Icons.check),
              label: Text(saving ? '保存中…' : '保存到账本'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _save() async {
    final value = double.tryParse(amount.text.trim());
    if (value == null || value <= 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请输入正确金额')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.controller.addEntry(
        amount: value,
        title: title.text.trim().isEmpty ? '未命名流水' : title.text.trim(),
        category: category.text.trim().isEmpty ? '其他' : category.text.trim(),
        type: type,
      );
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$error')));
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}

class EditTransactionSheet extends StatefulWidget {
  const EditTransactionSheet({
    required this.controller,
    required this.item,
    super.key,
  });

  final LedgerController controller;
  final TransactionItem item;

  @override
  State<EditTransactionSheet> createState() => _EditTransactionSheetState();
}

class _EditTransactionSheetState extends State<EditTransactionSheet> {
  late final TextEditingController title;
  late final TextEditingController amount;
  late final TextEditingController category;
  late String type;
  String? mood;
  int? accountId;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    final item = widget.item;
    title = TextEditingController(text: item.title);
    amount = TextEditingController(text: item.amount.toStringAsFixed(2));
    category = TextEditingController(
      text: item.category ?? item.incomeCategory ?? '其他',
    );
    type = item.type;
    mood = item.mood;
    accountId = item.accountId > 0 ? item.accountId : null;
  }

  @override
  void dispose() {
    title.dispose();
    amount.dispose();
    category.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final accounts = widget.controller.accounts;
    final selectedAccount = accounts.any((item) => item.id == accountId)
        ? accountId
        : (accounts.isEmpty ? null : accounts.first.id);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, bottom + 24),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              '编辑流水',
              style: TextStyle(fontSize: 25, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(
                  value: '支出',
                  label: Text('支出'),
                  icon: Icon(Icons.north_east),
                ),
                ButtonSegment(
                  value: '收入',
                  label: Text('收入'),
                  icon: Icon(Icons.south_west),
                ),
              ],
              selected: {type},
              onSelectionChanged: (value) => setState(() => type = value.first),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: amount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: '金额',
                prefixText: '¥ ',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: title,
              decoration: const InputDecoration(labelText: '项目'),
            ),
            const SizedBox(height: 12),
            if (accounts.isNotEmpty)
              DropdownButtonFormField<int>(
                initialValue: selectedAccount,
                decoration: const InputDecoration(labelText: '账户'),
                items: [
                  for (final account in accounts)
                    DropdownMenuItem(
                      value: account.id,
                      child: Text('${account.icon} ${account.name}'),
                    ),
                ],
                onChanged: (value) => setState(() => accountId = value),
              ),
            if (accounts.isNotEmpty) const SizedBox(height: 12),
            TextField(
              controller: category,
              decoration: const InputDecoration(
                labelText: '分类',
                hintText: '需填写当前账本中的有效分类',
              ),
            ),
            if (type == '支出') ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: mood,
                decoration: const InputDecoration(labelText: '消费性质'),
                items: const [
                  DropdownMenuItem(value: '刚需', child: Text('刚需')),
                  DropdownMenuItem(value: '想要', child: Text('想要')),
                  DropdownMenuItem(value: '冲动', child: Text('冲动')),
                ],
                onChanged: (value) => setState(() => mood = value),
              ),
            ],
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: saving ? null : _save,
              icon: const Icon(Icons.save_outlined),
              label: Text(saving ? '保存中…' : '保存修改'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _save() async {
    final value = double.tryParse(amount.text.trim());
    final selectedAccount =
        accountId ??
        (widget.controller.accounts.isEmpty
            ? 0
            : widget.controller.accounts.first.id);
    if (value == null || value <= 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请输入正确金额')));
      return;
    }
    if (selectedAccount <= 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('当前账本没有可用账户')));
      return;
    }
    if (category.text.trim().isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请填写分类')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.controller.updateTransaction(
        widget.item,
        title: title.text.trim().isEmpty ? '未命名流水' : title.text.trim(),
        amount: value,
        type: type,
        accountId: selectedAccount,
        category: category.text.trim(),
        mood: mood,
      );
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存失败：$error')));
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }
}

class PendingSheet extends StatefulWidget {
  const PendingSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<PendingSheet> createState() => _PendingSheetState();
}

class _PendingSheetState extends State<PendingSheet> {
  final busy = <int>{};

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final items = widget.controller.pendingTransactions.items;
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * .82,
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    '待处理账单（服务器 ${widget.controller.pendingServerCount} + 本机 ${widget.controller.pendingCount}）',
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text('服务器账单确认后才会入账；本机账单已保存，联网后同步。'),
                  const SizedBox(height: 14),
                  if (widget.controller.pendingCount > 0)
                    Card(
                      color: const Color(0xff2c3d24),
                      child: ListTile(
                        leading: const Icon(
                          Icons.cloud_upload_outlined,
                          color: _brand,
                        ),
                        title: Text(
                          '本机有 ${widget.controller.pendingCount} 条待同步账单',
                        ),
                        subtitle: const Text('这些账单已进入本机队列，不会因为关闭页面而丢失。'),
                        trailing: FilledButton.tonal(
                          onPressed: widget.controller.loading
                              ? null
                              : () async {
                                  try {
                                    await widget.controller.syncQueue();
                                  } catch (error) {
                                    if (context.mounted) {
                                      ScaffoldMessenger.of(
                                        context,
                                      ).showSnackBar(
                                        SnackBar(content: Text('同步失败：$error')),
                                      );
                                    }
                                  }
                                },
                          child: const Text('立即同步'),
                        ),
                      ),
                    ),
                  if (widget.controller.pendingCount > 0)
                    const SizedBox(height: 10),
                  Expanded(
                    child: items.isEmpty
                        ? const _EmptyState(message: '当前没有服务器待处理账单')
                        : ListView.separated(
                            itemCount: items.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(height: 8),
                            itemBuilder: (context, index) =>
                                _pendingItem(context, items[index]),
                          ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _pendingItem(BuildContext context, PendingTransaction item) {
    final isBusy = busy.contains(item.id);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    item.title,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                Text(
                  '${item.type == '收入' ? '+' : '-'}${_money(item.amountCents)}',
                  style: TextStyle(
                    color: item.type == '收入' ? _brand : Colors.orangeAccent,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 5),
            Text(
              '${item.accountName ?? '未指定账户'} · ${_date(item.occurredAt)}',
              style: TextStyle(color: Colors.white.withValues(alpha: .7)),
            ),
            if (item.suggestion != null && item.suggestion!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 5),
                child: Text('建议分类：${item.suggestion}'),
              ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: isBusy ? null : () => _resolve(item, 'ignore'),
                  child: const Text('忽略'),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: isBusy ? null : () => _resolve(item, 'confirm'),
                  child: Text(isBusy ? '处理中…' : '确认入账'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _resolve(PendingTransaction item, String action) async {
    setState(() => busy.add(item.id));
    try {
      await widget.controller.resolvePending(
        item,
        action,
        category: action == 'confirm' ? item.suggestion : null,
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('处理失败：$error')));
      }
    } finally {
      if (mounted) setState(() => busy.remove(item.id));
    }
  }
}

class NotificationSheet extends StatelessWidget {
  const NotificationSheet({required this.items, super.key});

  final List<NotificationItem> items;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * .75,
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                '通知中心',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 14),
              Expanded(
                child: items.isEmpty
                    ? const _EmptyState(message: '暂无通知')
                    : ListView.separated(
                        itemCount: items.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final item = items[index];
                          return Card(
                            color: item.read
                                ? _surfaceAlt
                                : const Color(0xff304d25),
                            child: ListTile(
                              leading: Icon(
                                item.read
                                    ? Icons.notifications_none
                                    : Icons.notifications_active,
                                color: item.read ? Colors.white70 : _brand,
                              ),
                              title: Text(item.title),
                              subtitle: Text(
                                '${item.message}\n${_date(item.createdAt)}',
                              ),
                              isThreeLine: true,
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CountBadge extends StatelessWidget {
  const _CountBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        color: Colors.redAccent,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _surfaceAlt, width: 2),
      ),
      alignment: Alignment.center,
      child: Text(
        count > 99 ? '99+' : '$count',
        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
      ),
    );
  }
}

class _ServerPendingBanner extends StatelessWidget {
  const _ServerPendingBanner({required this.controller, required this.onTap});

  final LedgerController controller;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xff4b3520),
      child: ListTile(
        leading: const Icon(
          Icons.fact_check_outlined,
          color: Colors.orangeAccent,
        ),
        title: Text('有 ${controller.pendingServerCount} 条待处理账单'),
        subtitle: const Text('确认后写入个人账单，避免误记和重复记账'),
        trailing: FilledButton.tonal(onPressed: onTap, child: const Text('处理')),
      ),
    );
  }
}

class _NotificationBanner extends StatelessWidget {
  const _NotificationBanner({required this.controller, required this.onTap});

  final LedgerController controller;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xff263d4c),
      child: ListTile(
        leading: const Icon(
          Icons.notifications_active,
          color: Colors.lightBlueAccent,
        ),
        title: Text('有 ${controller.unreadNotificationCount} 条未读通知'),
        subtitle: const Text('点击查看并标记为已读'),
        trailing: FilledButton.tonal(onPressed: onTap, child: const Text('查看')),
      ),
    );
  }
}

class _QueueBanner extends StatelessWidget {
  const _QueueBanner({required this.controller});

  final LedgerController controller;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xff2c3d24),
      child: ListTile(
        leading: const Icon(Icons.cloud_upload_outlined, color: _brand),
        title: Text('有 ${controller.pendingCount} 条待同步账单'),
        subtitle: const Text('联网后可自动同步，也可以现在重试'),
        trailing: TextButton(
          onPressed: controller.syncQueue,
          child: const Text('立即同步'),
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Card(
    color: Theme.of(context).colorScheme.errorContainer,
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Text(
        message,
        style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer),
      ),
    ),
  );
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label, style: TextStyle(color: Colors.grey.shade400)),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 23,
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    ),
  );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Center(
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.grey.shade400),
          ),
        ),
      ),
    );
  }
}

String _money(int cents) => NumberFormat.currency(
  locale: 'zh_CN',
  symbol: '¥',
  decimalDigits: 2,
).format(cents / 100);

String _moneyYuan(double? amount) {
  if (amount == null || !amount.isFinite) return '—';
  return NumberFormat.currency(
    locale: 'zh_CN',
    symbol: '¥',
    decimalDigits: 2,
  ).format(amount);
}

String _date(String value) {
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return value;
  return DateFormat('MM-dd HH:mm').format(parsed.toLocal());
}
