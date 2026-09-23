import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import 'app.dart';
import 'api_client.dart';
import 'mobile/core/mobile_design.dart';
import 'mobile/data/mobile_entry_preferences.dart';
import 'mobile/domain/amount_expression.dart';
import 'models.dart';

const _mobileBg = MobileColors.background;
const _mobileSurface = MobileColors.surface;
const _mobileSurfaceRaised = MobileColors.surfaceRaised;
const _mobileLine = MobileColors.line;
const _mobileBrand = MobileColors.brand;
const _mobilePurple = MobileColors.purple;
const _mobileMuted = MobileColors.muted;
const _mobileIncome = MobileColors.income;
const _mobileExpense = MobileColors.expense;
const _supportedMobileCurrencies = ['CNY', 'USD', 'JPY', 'EUR'];

Future<void> _confirmMobileLogout(
  BuildContext context,
  LedgerController controller,
) async {
  final pending = controller.totalPendingCount;
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('退出当前账号？'),
      content: Text(
        pending == 0
            ? '已同步数据不会受到影响。退出后需要重新登录才能继续使用。'
            : '当前还有 $pending 笔数据待同步或待确认。退出不会删除本地队列，但建议同步完成后再退出。',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          child: const Text('仍要退出'),
        ),
      ],
    ),
  );
  if (confirmed == true && context.mounted) {
    await controller.logout();
  }
}

class MobileLedgerShell extends StatefulWidget {
  const MobileLedgerShell({
    super.key,
    required this.controller,
    required this.nativeVersion,
  });

  final LedgerController controller;
  final String nativeVersion;

  @override
  State<MobileLedgerShell> createState() => _MobileLedgerShellState();
}

class _MobileLedgerShellState extends State<MobileLedgerShell>
    with WidgetsBindingObserver {
  int _tab = 0;
  bool _locked = false;
  bool _lockInitialized = false;

  LedgerController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed ||
        !controller.authenticated ||
        !controller.preferences.lockEnabled ||
        _locked) {
      return;
    }
    if (mounted) setState(() => _locked = true);
  }

  @override
  Widget build(BuildContext context) {
    if (!controller.authenticated) {
      _lockInitialized = false;
      _locked = false;
      if (controller.loading || controller.api.hasSession) {
        return const _MobileLoadingView();
      }
      return MobileLoginPage(controller: controller);
    }

    if (!_lockInitialized) {
      _lockInitialized = true;
      if (controller.preferences.lockEnabled) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && controller.authenticated) {
            setState(() => _locked = true);
          }
        });
      }
    }
    if (_locked) {
      return MobileAppLockPage(
        controller: controller,
        onUnlocked: () => setState(() => _locked = false),
      );
    }

    final pages = [
      MobileHomePage(
        controller: controller,
        onAdd: _openAdd,
        onTransfer: () => _openAdd(initialType: '转账'),
      ),
      MobileBillsPage(controller: controller),
      MobileAnalysisPage(controller: controller),
      MobileProfilePage(
        controller: controller,
        nativeVersion: widget.nativeVersion,
      ),
    ];
    return Scaffold(
      backgroundColor: _mobileBg,
      body: IndexedStack(index: _tab, children: pages),
      floatingActionButton: FloatingActionButton(
        heroTag: 'mobile-add-entry',
        backgroundColor: _mobileBrand,
        foregroundColor: _mobileBg,
        elevation: 8,
        onPressed: _openAdd,
        child: const Icon(Icons.add_rounded, size: 30),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (index) => setState(() => _tab = index),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded),
            label: '首页',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long_rounded),
            label: '账单',
          ),
          NavigationDestination(
            icon: Icon(Icons.insights_outlined),
            selectedIcon: Icon(Icons.insights_rounded),
            label: '分析',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: '我的',
          ),
        ],
      ),
    );
  }

  Future<void> _openAdd({String initialType = '支出'}) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => MobileAddTransactionPage(
          controller: controller,
          initialType: initialType,
        ),
      ),
    );
  }
}

class MobileAppLockPage extends StatefulWidget {
  const MobileAppLockPage({
    super.key,
    required this.controller,
    required this.onUnlocked,
  });

  final LedgerController controller;
  final VoidCallback onUnlocked;

  @override
  State<MobileAppLockPage> createState() => _MobileAppLockPageState();
}

class _MobileAppLockPageState extends State<MobileAppLockPage> {
  final _pin = TextEditingController();
  bool _verifying = false;
  String? _error;

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  Future<void> _unlock() async {
    if (_pin.text.trim().isEmpty || _verifying) return;
    setState(() {
      _verifying = true;
      _error = null;
    });
    try {
      final valid = await widget.controller.verifyPin(_pin.text);
      if (!mounted) return;
      if (valid) {
        widget.onUnlocked();
      } else {
        setState(() {
          _pin.clear();
          _error = 'PIN 不正确，请重试';
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = '暂时无法验证 PIN：$error');
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: _mobileBg,
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _mobileBrand.withAlpha(30),
                ),
                child: const Icon(
                  Icons.lock_outline_rounded,
                  color: _mobileBrand,
                  size: 36,
                ),
              ),
              const SizedBox(height: 18),
              const Text(
                'Neo Ledger 已锁定',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              const Text(
                '输入账本隐私锁 PIN 后继续使用',
                style: TextStyle(color: _mobileMuted),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _pin,
                autofocus: true,
                obscureText: true,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _unlock(),
                decoration: InputDecoration(
                  labelText: 'PIN',
                  errorText: _error,
                  prefixIcon: const Icon(Icons.password_rounded),
                ),
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _verifying ? null : _unlock,
                  child: _verifying
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('解锁'),
                ),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () =>
                    _confirmMobileLogout(context, widget.controller),
                child: const Text('退出当前账号'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class MobileLoginPage extends StatefulWidget {
  const MobileLoginPage({super.key, required this.controller});

  final LedgerController controller;

  @override
  State<MobileLoginPage> createState() => _MobileLoginPageState();
}

class _MobileLoginPageState extends State<MobileLoginPage> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    return Scaffold(
      backgroundColor: _mobileBg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 60, 24, 28),
          children: [
            const _MobileBrandMark(),
            const SizedBox(height: 28),
            Text(
              '把每一笔生活，\n记得更轻松',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                height: 1.18,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              '移动端使用原生交互，数据仍与网页、Windows 和 macOS 共用同一账本。',
              style: TextStyle(color: _mobileMuted, height: 1.6),
            ),
            const SizedBox(height: 32),
            _MobileTextField(
              controller: _username,
              label: '账号或邮箱',
              icon: Icons.person_outline_rounded,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 14),
            _MobileTextField(
              controller: _password,
              label: '密码',
              icon: Icons.lock_outline_rounded,
              obscureText: _obscure,
              suffix: IconButton(
                onPressed: () => setState(() => _obscure = !_obscure),
                icon: Icon(
                  _obscure
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  color: _mobileMuted,
                ),
              ),
              onSubmitted: (_) => _login(),
            ),
            if (controller.error != null) ...[
              const SizedBox(height: 14),
              _InlineError(message: controller.error!),
            ],
            const SizedBox(height: 22),
            SizedBox(
              height: 54,
              child: FilledButton(
                onPressed: controller.loading ? null : _login,
                style: FilledButton.styleFrom(
                  backgroundColor: _mobileBrand,
                  foregroundColor: _mobileBg,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: controller.loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text(
                        '登录 Neo Ledger',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
              ),
            ),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: controller.loading ? null : controller.loadDemo,
              icon: const Icon(Icons.auto_awesome_outlined),
              label: const Text('先体验原生移动端'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: const BorderSide(color: _mobileLine),
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
            ),
            const SizedBox(height: 26),
            const Text(
              '登录地址已固定为 ledger.eyeme.online。首次使用请先在网页端注册账号。',
              textAlign: TextAlign.center,
              style: TextStyle(color: _mobileMuted, fontSize: 12, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _login() async {
    final username = _username.text.trim();
    if (username.isEmpty || _password.text.isEmpty) {
      widget.controller.clearError();
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请输入账号和密码')));
      return;
    }
    await widget.controller.login(
      url: 'https://ledger.eyeme.online',
      username: username,
      password: _password.text,
    );
  }
}

class MobileHomePage extends StatefulWidget {
  const MobileHomePage({
    super.key,
    required this.controller,
    required this.onAdd,
    required this.onTransfer,
  });

  final LedgerController controller;
  final VoidCallback onAdd;
  final VoidCallback onTransfer;

  @override
  State<MobileHomePage> createState() => _MobileHomePageState();
}

class _MobileHomePageState extends State<MobileHomePage> {
  bool get _hideAmounts => widget.controller.preferences.hideAmounts;

  bool _moduleEnabled(String key) =>
      widget.controller.preferences.homeModules.contains(key);

  Future<void> _toggleAmounts() async {
    final next = !_hideAmounts;
    try {
      await widget.controller.saveMobileSettings(hideAmounts: next);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('隐藏金额设置失败：$error')));
      }
    }
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
      backgroundColor: _mobileSurface,
      builder: (_) => NotificationSheet(items: widget.controller.notifications),
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final page = controller.transactions;
    final displayName = controller.user?.displayName ?? '朋友';
    return _MobilePage(
      controller: controller,
      title: '首页',
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            tooltip: _hideAmounts ? '显示金额' : '隐藏金额',
            onPressed: _toggleAmounts,
            icon: Icon(
              _hideAmounts
                  ? Icons.visibility_off_outlined
                  : Icons.visibility_outlined,
              color: _mobileMuted,
            ),
          ),
          Stack(
            clipBehavior: Clip.none,
            children: [
              IconButton(
                tooltip: '通知中心',
                onPressed: _openNotifications,
                icon: const Icon(
                  Icons.notifications_none_rounded,
                  color: _mobileMuted,
                ),
              ),
              if (controller.unreadNotificationCount > 0)
                Positioned(
                  right: 2,
                  top: 0,
                  child: Container(
                    constraints: const BoxConstraints(
                      minWidth: 17,
                      minHeight: 17,
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: _mobileExpense,
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Text(
                      '${controller.unreadNotificationCount}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          _SyncButton(controller: controller),
        ],
      ),
      child: RefreshIndicator(
        color: _mobileBrand,
        backgroundColor: _mobileSurfaceRaised,
        onRefresh: controller.refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 120),
          children: [
            Text(
              '${_greeting()}，$displayName',
              style: const TextStyle(color: _mobileMuted, fontSize: 14),
            ),
            const SizedBox(height: 6),
            Text(
              '今天也把生活过得有条理。',
              style: Theme.of(context).textTheme.headlineSmall
                  ?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 18),
            _LedgerContextCard(
              controller: controller,
              hideAmounts: _hideAmounts,
            ),
            const SizedBox(height: 12),
            if (_moduleEnabled('summary'))
              _MonthlyCard(page: page, hideAmounts: _hideAmounts),
            if (_moduleEnabled('budget') && controller.budgets.isNotEmpty) ...[
              const SizedBox(height: 14),
              _HomeBudgetCard(
                controller: controller,
                hideAmounts: _hideAmounts,
              ),
            ],
            if (_moduleEnabled('pending') &&
                controller.pendingTransactions.items.isNotEmpty) ...[
              const SizedBox(height: 14),
              _HomePendingCard(
                controller: controller,
                hideAmounts: _hideAmounts,
              ),
            ],
            if (_moduleEnabled('weeklyTrend') && page.items.isNotEmpty) ...[
              const SizedBox(height: 14),
              _HomeWeeklyTrendCard(page: page, hideAmounts: _hideAmounts),
            ],
            const SizedBox(height: 20),
            _SectionHeader(title: '快捷操作', action: '全部功能'),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _QuickAction(
                    icon: Icons.add_rounded,
                    label: '记一笔',
                    color: _mobileBrand,
                    onTap: widget.onAdd,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _QuickAction(
                    icon: Icons.swap_horiz_rounded,
                    label: '转账',
                    color: _mobilePurple,
                    onTap: widget.onTransfer,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _QuickAction(
                    icon: Icons.flag_outlined,
                    label: '预算',
                    color: const Color(0xffffc76b),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) =>
                            MobileBudgetPage(controller: controller),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            if (_moduleEnabled('recent')) ...[
              const SizedBox(height: 26),
              _SectionHeader(
                title: '最近账单',
                action: page.items.isEmpty ? null : '共 ${page.total} 笔',
              ),
              const SizedBox(height: 10),
              if (page.items.isEmpty)
                const _EmptyState(
                  icon: Icons.auto_graph_rounded,
                  title: '还没有账单',
                  message: '点击下方绿色 +，记录第一笔今天的生活。',
                )
              else
                ...page.items
                    .take(8)
                    .map(
                      (item) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _TransactionTile(
                          item: item,
                          hideAmount: _hideAmounts,
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

class _LedgerContextCard extends StatelessWidget {
  const _LedgerContextCard({
    required this.controller,
    required this.hideAmounts,
  });

  final LedgerController controller;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    final ledger = controller.selectedLedger;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      decoration: _mobileBoxDecoration(),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: _mobileBrand.withValues(alpha: .14),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Text(
              ledger?.icon ?? '📚',
              style: const TextStyle(fontSize: 20),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  ledger?.name ?? '我的账本',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${DateFormat('yyyy年MM月').format(DateTime.now())} · ${controller.error == null ? '已同步' : '离线快照'}',
                  style: const TextStyle(color: _mobileMuted, fontSize: 12),
                ),
              ],
            ),
          ),
          Icon(
            hideAmounts
                ? Icons.visibility_off_outlined
                : Icons.cloud_done_outlined,
            size: 19,
            color: controller.error == null ? _mobileIncome : _mobileMuted,
          ),
        ],
      ),
    );
  }
}

class _HomeBudgetCard extends StatelessWidget {
  const _HomeBudgetCard({required this.controller, required this.hideAmounts});

  final LedgerController controller;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    final spendByCategory = <String, int>{};
    for (final bucket in controller.analysis?.categoryData ?? const []) {
      spendByCategory[bucket.name] = bucket.amountCents;
    }
    final totalBudget = controller.budgets.fold<int>(
      0,
      (sum, item) => sum + item.amountCents,
    );
    final totalSpent = controller.budgets.fold<int>(
      0,
      (sum, item) => sum + (spendByCategory[item.category] ?? 0),
    );
    final ratio = totalBudget <= 0 ? 0.0 : totalSpent / totalBudget;
    final danger = ratio >= 1;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _mobileBoxDecoration(
        gradient: LinearGradient(
          colors: danger
              ? const [Color(0xff42272d), Color(0xff2c2028)]
              : const [Color(0xff263a34), Color(0xff202a2b)],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.track_changes_rounded, color: _mobileBrand),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  '本月预算',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              Text(
                danger
                    ? '已超支'
                    : '剩余 ${hideAmounts ? '••••' : _mobileMoney(totalBudget - totalSpent)}',
                style: TextStyle(color: danger ? _mobileExpense : _mobileMuted),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              minHeight: 9,
              value: ratio.clamp(0, 1),
              backgroundColor: const Color(0x24ffffff),
              valueColor: AlwaysStoppedAnimation(
                danger ? _mobileExpense : _mobileBrand,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '${hideAmounts ? '••••' : _mobileMoney(totalSpent)} / ${hideAmounts ? '••••' : _mobileMoney(totalBudget)} · ${controller.budgets.length} 个分类预算',
            style: const TextStyle(color: _mobileMuted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _HomePendingCard extends StatelessWidget {
  const _HomePendingCard({required this.controller, required this.hideAmounts});

  final LedgerController controller;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    final item = controller.pendingTransactions.items.first;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _mobileBoxDecoration(),
      child: Row(
        children: [
          const Icon(Icons.fact_check_outlined, color: _mobilePurple),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '有待确认账单',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(
                  '${item.title} · ${hideAmounts ? '••••' : _mobileMoney(item.amountCents)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: _mobileMuted, fontSize: 12),
                ),
              ],
            ),
          ),
          Text(
            '${controller.pendingTransactions.total} 笔',
            style: const TextStyle(
              color: _mobilePurple,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _HomeWeeklyTrendCard extends StatelessWidget {
  const _HomeWeeklyTrendCard({required this.page, required this.hideAmounts});

  final TransactionPage page;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now();
    final daily = <DateTime, int>{};
    for (var offset = 6; offset >= 0; offset--) {
      final day = DateTime(
        today.year,
        today.month,
        today.day,
      ).subtract(Duration(days: offset));
      daily[day] = 0;
    }
    for (final item in page.items) {
      if (item.isIncome) continue;
      final occurred = DateTime.tryParse(item.occurredAt)?.toLocal();
      if (occurred == null) continue;
      final day = DateTime(occurred.year, occurred.month, occurred.day);
      if (daily.containsKey(day)) daily[day] = daily[day]! + item.amountCents;
    }
    final maximum = daily.values.fold<int>(
      1,
      (max, value) => value > max ? value : max,
    );
    final total = daily.values.fold<int>(0, (sum, value) => sum + value);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 15, 16, 13),
      decoration: _mobileBoxDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.show_chart_rounded, color: _mobilePurple),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  '近 7 日支出',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              Text(
                hideAmounts ? '••••' : _mobileMoney(total),
                style: const TextStyle(color: _mobileMuted, fontSize: 12),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 74,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (final entry in daily.entries)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 3),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Expanded(
                            child: Align(
                              alignment: Alignment.bottomCenter,
                              child: FractionallySizedBox(
                                heightFactor: (entry.value / maximum).clamp(
                                  .04,
                                  1,
                                ),
                                widthFactor: .7,
                                child: DecoratedBox(
                                  decoration: BoxDecoration(
                                    color: entry.value == 0
                                        ? const Color(0x24ffffff)
                                        : _mobilePurple,
                                    borderRadius: const BorderRadius.vertical(
                                      top: Radius.circular(6),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            DateFormat('E', 'zh_CN').format(entry.key),
                            style: const TextStyle(
                              color: _mobileMuted,
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class MobileBillsPage extends StatefulWidget {
  const MobileBillsPage({super.key, required this.controller});

  final LedgerController controller;

  @override
  State<MobileBillsPage> createState() => _MobileBillsPageState();
}

class _MobileBillsPageState extends State<MobileBillsPage> {
  final _search = TextEditingController();
  final _searchPreferences = const MobileEntryPreferences();
  late DateTime _month;
  TransactionPage? _page;
  bool _loading = false;
  String? _error;
  int? _accountFilter;
  String? _typeFilter;
  String? _categoryFilter;
  double? _minAmount;
  double? _maxAmount;
  DateTime? _dateFrom;
  DateTime? _dateTo;
  bool _loadingMore = false;
  bool _selectionMode = false;
  final _selectedIds = <int>{};
  List<String> _searchHistory = const [];
  List<Map<String, dynamic>> _filterHistory = const [];

  LedgerController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month);
    _page = controller.transactions;
    _loadSearchHistory();
    _loadFilterHistory();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final page = _page ?? controller.transactions;
    final groups = _groupByDay(page.items);
    return _MobilePage(
      controller: controller,
      title: '账单',
      trailing: IconButton(
        tooltip: '回到本月',
        onPressed: _selectionMode ? _exitSelectionMode : _goToCurrentMonth,
        icon: Icon(
          _selectionMode ? Icons.close_rounded : Icons.today_rounded,
          color: _mobileMuted,
        ),
      ),
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 110),
          children: [
            if (_selectionMode) ...[
              _MobileSelectionToolbar(
                count: _selectedIds.length,
                onCancel: _exitSelectionMode,
                onApply: _openBatchActions,
              ),
              const SizedBox(height: 12),
            ],
            Row(
              children: [
                IconButton(
                  onPressed: () => _changeMonth(-1),
                  icon: const Icon(Icons.chevron_left_rounded),
                ),
                Expanded(
                  child: InkWell(
                    onTap: _pickMonth,
                    borderRadius: BorderRadius.circular(14),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Text(
                        _periodLabel,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => _changeMonth(1),
                  icon: const Icon(Icons.chevron_right_rounded),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _search,
              textInputAction: TextInputAction.search,
              onChanged: (_) => setState(() {}),
              onSubmitted: (_) {
                _rememberSearch();
                _load();
              },
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search_rounded),
                hintText: '搜索标题、备注、标签、分类、账户、金额…',
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        onPressed: () {
                          _search.clear();
                          _load();
                        },
                        icon: const Icon(Icons.close_rounded),
                      ),
              ),
            ),
            if (_search.text.trim().isEmpty && _searchHistory.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  for (final query in _searchHistory)
                    ActionChip(
                      label: Text(query),
                      onPressed: () {
                        _search.text = query;
                        _search.selection = TextSelection.collapsed(
                          offset: query.length,
                        );
                        _rememberSearch();
                        _load();
                      },
                    ),
                ],
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: _openFilters,
                  icon: const Icon(Icons.tune_rounded),
                  label: Text(_hasFilters ? '筛选已启用' : '组合筛选'),
                ),
                if (_hasFilters) ...[
                  const SizedBox(width: 8),
                  TextButton(onPressed: _clearFilters, child: const Text('清除')),
                ],
              ],
            ),
            if (_search.text.trim().isEmpty && _filterHistory.isNotEmpty) ...[
              const SizedBox(height: 8),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '最近筛选',
                  style: TextStyle(color: _mobileMuted, fontSize: 12),
                ),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  for (final filter in _filterHistory)
                    ActionChip(
                      label: Text('${filter['label']}'),
                      onPressed: () => _applyFilterHistory(filter),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 14),
            if (_loading) const LinearProgressIndicator(minHeight: 2),
            if (_error != null) ...[
              _InlineError(message: _error!, onRetry: _load),
              const SizedBox(height: 12),
            ],
            _BillSummary(
              page: page,
              hideAmounts: controller.preferences.hideAmounts,
            ),
            const SizedBox(height: 20),
            _SectionHeader(title: '全部流水', action: '${page.total} 笔'),
            const SizedBox(height: 10),
            if (groups.isEmpty)
              const _EmptyState(
                icon: Icons.receipt_long_outlined,
                title: '这个月还没有账单',
                message: '切换月份或点击下方绿色 + 记录一笔。',
              )
            else
              for (final entry in groups.entries) ...[
                _DaySummaryHeader(
                  day: entry.key,
                  items: entry.value,
                  hideAmounts: controller.preferences.hideAmounts,
                ),
                const SizedBox(height: 8),
                for (final item in entry.value)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Dismissible(
                      key: ValueKey('mobile-bill-${item.id}'),
                      direction: DismissDirection.endToStart,
                      background: Container(
                        alignment: Alignment.centerRight,
                        padding: const EdgeInsets.only(right: 20),
                        decoration: BoxDecoration(
                          color: _mobileExpense.withValues(alpha: .18),
                          borderRadius: BorderRadius.circular(18),
                        ),
                        child: const Icon(
                          Icons.delete_outline_rounded,
                          color: _mobileExpense,
                        ),
                      ),
                      confirmDismiss: (_) => _confirmDelete(item),
                      child: _TransactionTile(
                        item: item,
                        dense: true,
                        selected: _selectedIds.contains(item.id),
                        onTap: _selectionMode
                            ? () => _toggleSelection(item)
                            : () => _openDetail(item),
                        onLongPress: _selectionMode
                            ? () => _toggleSelection(item)
                            : () => _openActions(item),
                      ),
                    ),
                  ),
                const SizedBox(height: 8),
              ],
            if (page.nextCursor != null) ...[
              const SizedBox(height: 4),
              OutlinedButton.icon(
                onPressed: _loading || _loadingMore ? null : _loadMore,
                icon: _loadingMore
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.expand_more_rounded),
                label: Text(_loadingMore ? '加载中…' : '加载更多历史账单'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _enterSelectionMode(TransactionItem item) {
    setState(() {
      _selectionMode = true;
      _selectedIds.add(item.id);
    });
  }

  void _toggleSelection(TransactionItem item) {
    setState(() {
      if (!_selectedIds.remove(item.id)) _selectedIds.add(item.id);
      if (_selectedIds.isEmpty) _selectionMode = false;
    });
  }

  void _exitSelectionMode() {
    setState(() {
      _selectionMode = false;
      _selectedIds.clear();
    });
  }

  Future<void> _openBatchActions() async {
    final selected = (_page?.items ?? const <TransactionItem>[])
        .where((item) => _selectedIds.contains(item.id))
        .toList(growable: false);
    final synced = selected
        .where((item) => item.id > 0 && item.updatedAt != null)
        .toList(growable: false);
    if (synced.length != selected.length) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('离线待同步流水暂不支持批量修改，请先联网同步')));
      return;
    }
    if (synced.isEmpty) return;
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.category_outlined),
              title: const Text('批量设置分类'),
              onTap: () => Navigator.pop(sheetContext, 'category'),
            ),
            ListTile(
              leading: const Icon(Icons.label_outline_rounded),
              title: const Text('批量设置标签'),
              onTap: () => Navigator.pop(sheetContext, 'tags'),
            ),
            ListTile(
              leading: const Icon(Icons.receipt_long_outlined),
              title: const Text('标记为待报销'),
              onTap: () => Navigator.pop(sheetContext, 'reimbursable'),
            ),
            ListTile(
              leading: const Icon(Icons.account_balance_wallet_outlined),
              title: const Text('不计入预算'),
              onTap: () => Navigator.pop(sheetContext, 'exclude'),
            ),
            ListTile(
              leading: const Icon(Icons.restart_alt_rounded),
              title: const Text('清除报销与预算标记'),
              onTap: () => Navigator.pop(sheetContext, 'clear-flags'),
            ),
            ListTile(
              leading: const Icon(
                Icons.delete_sweep_outlined,
                color: _mobileExpense,
              ),
              title: const Text(
                '批量删除流水',
                style: TextStyle(color: _mobileExpense),
              ),
              onTap: () => Navigator.pop(sheetContext, 'delete'),
            ),
          ],
        ),
      ),
    );
    if (!mounted || action == null) return;
    if (action == 'delete') {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text('删除 ${synced.length} 笔流水？'),
          content: const Text('删除会同步到网页、Windows、macOS 和其他移动设备，可在短时间内撤销。'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('确认删除'),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
      final deleted = <MapEntry<TransactionItem, String>>[];
      try {
        for (final item in synced) {
          final token = await controller.deleteTransaction(item);
          if (token != null) deleted.add(MapEntry(item, token));
        }
        if (mounted) {
          _exitSelectionMode();
          await _load();
          if (mounted) {
            final messenger = ScaffoldMessenger.of(context);
            messenger.showSnackBar(
              SnackBar(
                content: Text(
                  deleted.length == synced.length
                      ? '已删除 ${synced.length} 笔流水，可在 2 分钟内撤销'
                      : '已删除 ${synced.length} 笔流水',
                ),
                action: deleted.length == synced.length
                    ? SnackBarAction(
                        label: '撤销',
                        onPressed: () async {
                          try {
                            for (final entry in deleted) {
                              await controller.restoreTransaction(
                                entry.key,
                                entry.value,
                              );
                            }
                            if (mounted) await _load();
                          } catch (error) {
                            if (mounted) {
                              messenger.showSnackBar(
                                SnackBar(content: Text('批量撤销失败：$error')),
                              );
                            }
                          }
                        },
                      )
                    : null,
              ),
            );
          }
        }
      } catch (error) {
        if (mounted) {
          await _load();
          if (mounted) {
            ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text('批量删除中断：$error')));
          }
        }
      }
      return;
    }
    String? category;
    String? incomeCategory;
    if (action == 'category') {
      final types = synced.map((item) => item.type).toSet();
      if (types.length != 1) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('请先只选择支出或收入流水，再批量设置分类')));
        return;
      }
      final income = types.single == '收入';
      final choices =
          (income ? controller.incomeCategories : controller.expenseCategories)
              .where((item) => item.isActive)
              .toList(growable: false);
      final selected = await showModalBottomSheet<String>(
        context: context,
        showDragHandle: true,
        backgroundColor: _mobileSurface,
        builder: (sheetContext) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              const ListTile(
                title: Text(
                  '选择分类',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              for (final choice in choices)
                ListTile(
                  leading: Text(
                    choice.icon,
                    style: const TextStyle(fontSize: 22),
                  ),
                  title: Text(choice.name),
                  onTap: () => Navigator.pop(sheetContext, choice.name),
                ),
            ],
          ),
        ),
      );
      if (!mounted || selected == null) return;
      if (income) {
        incomeCategory = selected;
      } else {
        category = selected;
      }
    }
    List<String>? tags;
    if (action == 'tags') {
      final input = TextEditingController();
      final value = await showDialog<String>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('批量设置标签'),
          content: TextField(
            controller: input,
            autofocus: true,
            decoration: const InputDecoration(hintText: '多个标签用逗号分隔'),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, input.text),
              child: const Text('应用'),
            ),
          ],
        ),
      );
      input.dispose();
      if (value == null) return;
      tags = value
          .split(RegExp(r'[,，]'))
          .map((tag) => tag.trim())
          .where((tag) => tag.isNotEmpty)
          .toSet()
          .take(12)
          .toList();
    }
    try {
      await controller.bulkUpdateTransactions(
        transactionIds: synced.map((item) => item.id).toList(),
        category: category,
        incomeCategory: incomeCategory,
        tags: tags,
        reimbursable: action == 'reimbursable'
            ? true
            : action == 'clear-flags'
            ? false
            : null,
        excludeFromBudget: action == 'exclude'
            ? true
            : action == 'clear-flags'
            ? false
            : null,
      );
      if (mounted) {
        _exitSelectionMode();
        await _load();
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('已更新 ${synced.length} 笔流水')));
        }
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('批量更新失败：$error')));
      }
    }
  }

  Future<void> _load({bool append = false}) async {
    final ledger = controller.selectedLedger;
    if (ledger == null) return;
    final fromDate = _dateFrom ?? _month;
    final last = DateTime(_month.year, _month.month + 1, 0);
    final toDate = _dateTo ?? last;
    final previous = _page;
    if (append && previous?.nextCursor == null) return;
    setState(() {
      if (append) {
        _loadingMore = true;
      } else {
        _loading = true;
        _error = null;
      }
    });
    try {
      final page = await controller.api.fetchTransactions(
        ledger.id,
        limit: 100,
        query: _search.text,
        from: DateFormat('yyyy-MM-dd').format(fromDate),
        to: DateFormat('yyyy-MM-dd').format(toDate),
        cursor: append ? previous?.nextCursor : null,
        timezoneOffsetMinutes: DateTime.now().timeZoneOffset.inMinutes,
        accountId: _accountFilter,
        type: _typeFilter,
        category: _categoryFilter,
        minAmount: _minAmount,
        maxAmount: _maxAmount,
      );
      if (mounted) {
        setState(() {
          _page = append && previous != null
              ? TransactionPage(
                  items: [...previous.items, ...page.items],
                  total: page.total,
                  incomeCents: page.incomeCents,
                  expenseCents: page.expenseCents,
                  nextCursor: page.nextCursor,
                )
              : page;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  Future<void> _loadMore() => _load(append: true);

  Future<void> _loadSearchHistory() async {
    final history = await _searchPreferences.recentBillSearches();
    if (mounted) setState(() => _searchHistory = history);
  }

  Future<void> _loadFilterHistory() async {
    final history = await _searchPreferences.recentBillFilters();
    if (mounted) setState(() => _filterHistory = history);
  }

  void _applyFilterHistory(Map<String, dynamic> filter) {
    setState(() {
      _accountFilter = _filterInt(filter['accountId']);
      _typeFilter = filter['type'] as String?;
      _categoryFilter = filter['category'] as String?;
      _minAmount = _filterDouble(filter['minAmount']);
      _maxAmount = _filterDouble(filter['maxAmount']);
      _dateFrom = _filterDate(filter['dateFrom']);
      _dateTo = _filterDate(filter['dateTo']);
    });
    _load();
  }

  int? _filterInt(Object? value) =>
      value is num ? value.toInt() : int.tryParse('$value');

  double? _filterDouble(Object? value) =>
      value is num ? value.toDouble() : double.tryParse('$value');

  DateTime? _filterDate(Object? value) =>
      value is String ? DateTime.tryParse(value) : null;

  String _filterLabel({
    String? type,
    int? accountId,
    String? category,
    double? minAmount,
    double? maxAmount,
    DateTime? dateFrom,
    DateTime? dateTo,
  }) {
    final labels = <String>[];
    if (type != null) labels.add(type);
    if (accountId != null) {
      final account = controller.accounts
          .where((item) => item.id == accountId)
          .firstOrNull;
      labels.add(account?.name ?? '账户');
    }
    if (category != null) labels.add(category);
    if (minAmount != null || maxAmount != null) {
      labels.add(
        '${minAmount?.toStringAsFixed(2) ?? '不限'}-${maxAmount?.toStringAsFixed(2) ?? '不限'}',
      );
    }
    if (dateFrom != null || dateTo != null) {
      labels.add(
        '${dateFrom == null ? '不限' : DateFormat('MM-dd').format(dateFrom)}~'
        '${dateTo == null ? '不限' : DateFormat('MM-dd').format(dateTo)}',
      );
    }
    return labels.isEmpty ? '全部账单' : labels.join(' · ');
  }

  Future<void> _rememberSearch() async {
    final query = _search.text.trim();
    if (query.isEmpty) return;
    await _searchPreferences.rememberBillSearch(query);
    if (mounted) {
      setState(() {
        _searchHistory = [
          query,
          ..._searchHistory.where((item) => item != query),
        ].take(6).toList();
      });
    }
  }

  void _changeMonth(int delta) {
    setState(() {
      _month = DateTime(_month.year, _month.month + delta);
      _dateFrom = null;
      _dateTo = null;
    });
    _load();
  }

  void _goToCurrentMonth() {
    final now = DateTime.now();
    setState(() {
      _month = DateTime(now.year, now.month);
      _dateFrom = null;
      _dateTo = null;
    });
    _load();
  }

  bool get _hasFilters =>
      _accountFilter != null ||
      _typeFilter != null ||
      _categoryFilter != null ||
      _minAmount != null ||
      _maxAmount != null ||
      _dateFrom != null ||
      _dateTo != null;

  String get _periodLabel {
    if (_dateFrom == null && _dateTo == null) {
      return DateFormat('yyyy年MM月').format(_month);
    }
    final from = _dateFrom == null
        ? '不限起始'
        : DateFormat('MM月dd日').format(_dateFrom!);
    final to = _dateTo == null ? '不限结束' : DateFormat('MM月dd日').format(_dateTo!);
    return '$from – $to';
  }

  void _clearFilters() {
    setState(() {
      _accountFilter = null;
      _typeFilter = null;
      _categoryFilter = null;
      _minAmount = null;
      _maxAmount = null;
      _dateFrom = null;
      _dateTo = null;
    });
    _load();
  }

  Future<void> _openFilters() async {
    var accountId = _accountFilter;
    var type = _typeFilter;
    var category = _categoryFilter;
    var dateFrom = _dateFrom;
    var dateTo = _dateTo;
    final minimum = TextEditingController(text: _minAmount?.toString() ?? '');
    final maximum = TextEditingController(text: _maxAmount?.toString() ?? '');
    final categories = {
      ...controller.expenseCategories
          .where((item) => item.isActive)
          .map((item) => item.name),
      ...controller.incomeCategories
          .where((item) => item.isActive)
          .map((item) => item.name),
    }.toList();
    final applied = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            18,
            4,
            18,
            MediaQuery.viewInsetsOf(context).bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                '组合筛选',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String?>(
                initialValue: type,
                decoration: const InputDecoration(labelText: '收支类型'),
                items: const [
                  DropdownMenuItem(value: null, child: Text('全部')),
                  DropdownMenuItem(value: '支出', child: Text('支出')),
                  DropdownMenuItem(value: '收入', child: Text('收入')),
                ],
                onChanged: (value) => setSheetState(() => type = value),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<int?>(
                initialValue: accountId,
                decoration: const InputDecoration(labelText: '账户'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('全部账户')),
                  for (final account in controller.accounts)
                    DropdownMenuItem(
                      value: account.id,
                      child: Text('${account.icon} ${account.name}'),
                    ),
                ],
                onChanged: (value) => setSheetState(() => accountId = value),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.calendar_today_rounded),
                      label: Text(
                        dateFrom == null
                            ? '不限起始日期'
                            : DateFormat('yyyy-MM-dd').format(dateFrom!),
                      ),
                      onPressed: () async {
                        final picked = await showDatePicker(
                          context: context,
                          firstDate: DateTime(2000),
                          lastDate: DateTime.now().add(
                            const Duration(days: 365),
                          ),
                          initialDate: dateFrom ?? dateTo ?? _month,
                        );
                        if (picked != null) {
                          setSheetState(() => dateFrom = picked);
                        }
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.event_rounded),
                      label: Text(
                        dateTo == null
                            ? '不限结束日期'
                            : DateFormat('yyyy-MM-dd').format(dateTo!),
                      ),
                      onPressed: () async {
                        final picked = await showDatePicker(
                          context: context,
                          firstDate: DateTime(2000),
                          lastDate: DateTime.now().add(
                            const Duration(days: 365),
                          ),
                          initialDate: dateTo ?? dateFrom ?? _month,
                        );
                        if (picked != null) {
                          setSheetState(() => dateTo = picked);
                        }
                      },
                    ),
                  ),
                ],
              ),
              if (dateFrom != null || dateTo != null)
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => setSheetState(() {
                      dateFrom = null;
                      dateTo = null;
                    }),
                    child: const Text('清除日期'),
                  ),
                ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String?>(
                initialValue: category,
                decoration: const InputDecoration(labelText: '分类'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('全部分类')),
                  for (final name in categories)
                    DropdownMenuItem(value: name, child: Text(name)),
                ],
                onChanged: (value) => setSheetState(() => category = value),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: minimum,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(labelText: '最低金额'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: maximum,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(labelText: '最高金额'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('应用筛选'),
              ),
            ],
          ),
        ),
      ),
    );
    if (applied == true && mounted) {
      final min = double.tryParse(minimum.text.trim());
      final max = double.tryParse(maximum.text.trim());
      if (min != null && max != null && min > max) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('最低金额不能大于最高金额')));
      } else if (dateFrom != null &&
          dateTo != null &&
          dateFrom!.isAfter(dateTo!)) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('起始日期不能晚于结束日期')));
      } else {
        setState(() {
          _accountFilter = accountId;
          _typeFilter = type;
          _categoryFilter = category;
          _minAmount = min;
          _maxAmount = max;
          _dateFrom = dateFrom;
          _dateTo = dateTo;
        });
        await _searchPreferences.rememberBillFilter({
          'label': _filterLabel(
            type: type,
            accountId: accountId,
            category: category,
            minAmount: min,
            maxAmount: max,
            dateFrom: dateFrom,
            dateTo: dateTo,
          ),
          'type': type,
          'accountId': accountId,
          'category': category,
          'minAmount': min,
          'maxAmount': max,
          'dateFrom': dateFrom?.toIso8601String(),
          'dateTo': dateTo?.toIso8601String(),
        });
        await _loadFilterHistory();
        _load();
      }
    }
    minimum.dispose();
    maximum.dispose();
  }

  Future<void> _pickMonth() async {
    final selected = await showDatePicker(
      context: context,
      initialDate: _month,
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      helpText: '选择月份（日期不影响结果）',
    );
    if (selected == null) return;
    setState(() {
      _month = DateTime(selected.year, selected.month);
      _dateFrom = null;
      _dateTo = null;
    });
    _load();
  }

  Map<DateTime, List<TransactionItem>> _groupByDay(
    List<TransactionItem> items,
  ) {
    final result = <DateTime, List<TransactionItem>>{};
    for (final item in items) {
      final parsed = DateTime.tryParse(item.occurredAt)?.toLocal();
      final day = parsed == null
          ? DateTime(1970)
          : DateTime(parsed.year, parsed.month, parsed.day);
      result.putIfAbsent(day, () => []).add(item);
    }
    return result;
  }

  Future<void> _openDetail(TransactionItem item) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) =>
            MobileTransactionDetailPage(controller: controller, item: item),
      ),
    );
    if (mounted) _load();
  }

  Future<bool> _confirmDelete(TransactionItem item) async {
    if (item.installmentId != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('分期生成的流水请从分期计划中管理')));
      return false;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除这笔流水？'),
        content: Text('“${item.title}”删除后会同步到其他平台。'),
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
    if (confirmed != true || !mounted) return false;
    try {
      final undoToken = await controller.deleteTransaction(item);
      if (mounted) {
        await _load();
      }
      if (mounted) {
        final messenger = ScaffoldMessenger.of(context);
        messenger.showSnackBar(
          SnackBar(
            content: const Text('流水已删除，可在 2 分钟内撤销'),
            action: undoToken == null
                ? null
                : SnackBarAction(
                    label: '撤销',
                    onPressed: () async {
                      try {
                        await controller.restoreTransaction(item, undoToken);
                        if (mounted) await _load();
                      } catch (error) {
                        if (mounted) {
                          messenger.showSnackBar(
                            SnackBar(content: Text('撤销失败：$error')),
                          );
                        }
                      }
                    },
                  ),
          ),
        );
      }
      return true;
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('删除失败：$error')));
      }
      return false;
    }
  }

  Future<void> _openActions(TransactionItem item) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.open_in_new_rounded),
              title: const Text('查看详情 / 编辑'),
              onTap: () => Navigator.pop(sheetContext, 'edit'),
            ),
            ListTile(
              leading: const Icon(Icons.copy_rounded),
              title: const Text('复制流水摘要'),
              onTap: () => Navigator.pop(sheetContext, 'copy'),
            ),
            ListTile(
              leading: const Icon(Icons.checklist_rounded),
              title: const Text('进入多选模式'),
              onTap: () => Navigator.pop(sheetContext, 'select'),
            ),
            if (item.installmentId == null)
              ListTile(
                leading: const Icon(
                  Icons.delete_outline_rounded,
                  color: _mobileExpense,
                ),
                title: const Text(
                  '删除流水',
                  style: TextStyle(color: _mobileExpense),
                ),
                onTap: () => Navigator.pop(sheetContext, 'delete'),
              ),
          ],
        ),
      ),
    );
    if (!mounted || action == null) return;
    switch (action) {
      case 'edit':
        await _openDetail(item);
      case 'copy':
        final amount = controller.preferences.hideAmounts
            ? '金额已隐藏'
            : _mobileMoney(item.amountCents);
        await Clipboard.setData(
          ClipboardData(
            text:
                '${item.type} $amount · ${item.title} · ${item.category ?? item.incomeCategory ?? '未分类'} · ${_mobileDate(item.occurredAt)}',
          ),
        );
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(const SnackBar(content: Text('流水摘要已复制')));
        }
      case 'delete':
        await _confirmDelete(item);
      case 'select':
        _enterSelectionMode(item);
    }
  }
}

class MobileTransactionDetailPage extends StatefulWidget {
  const MobileTransactionDetailPage({
    super.key,
    required this.controller,
    required this.item,
  });

  final LedgerController controller;
  final TransactionItem item;

  @override
  State<MobileTransactionDetailPage> createState() =>
      _MobileTransactionDetailPageState();
}

class _MobileTransactionDetailPageState
    extends State<MobileTransactionDetailPage> {
  bool _deleting = false;

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final hideAmounts = widget.controller.preferences.hideAmounts;
    final occurredAt = DateTime.tryParse(item.occurredAt)?.toLocal();
    final color = item.isIncome ? _mobileIncome : _mobileExpense;
    return Scaffold(
      backgroundColor: _mobileBg,
      appBar: AppBar(
        title: const Text('账单详情'),
        actions: [
          IconButton(
            tooltip: '编辑',
            onPressed: _edit,
            icon: const Icon(Icons.edit_outlined),
          ),
          IconButton(
            tooltip: '删除',
            onPressed: _deleting ? null : _delete,
            icon: const Icon(Icons.delete_outline_rounded),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 20, 18, 32),
        children: [
          Container(
            padding: const EdgeInsets.symmetric(vertical: 26, horizontal: 20),
            decoration: _mobileBoxDecoration(),
            child: Column(
              children: [
                Text(item.type, style: const TextStyle(color: _mobileMuted)),
                const SizedBox(height: 8),
                Text(
                  hideAmounts
                      ? '••••'
                      : '${item.isIncome ? '+' : '-'}${_mobileMoneyCurrency(item.amountCents, item.currency)}',
                  style: TextStyle(
                    color: color,
                    fontSize: 38,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  item.title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _DetailRow(
            label: '分类',
            value: item.category ?? item.incomeCategory ?? '未分类',
          ),
          _DetailRow(label: '账户', value: item.accountName ?? '未知账户'),
          _DetailRow(label: '币种', value: item.currency),
          if (!hideAmounts &&
              item.originalAmountCents != null &&
              item.originalCurrency != null)
            _DetailRow(
              label: '原币金额',
              value: _mobileMoneyCurrency(
                item.originalAmountCents!,
                item.originalCurrency!,
              ),
            ),
          if (item.originalCurrency != null &&
              item.originalCurrency != item.currency)
            _DetailRow(
              label: '汇率',
              value:
                  '1 ${item.originalCurrency} = ${(item.exchangeRateMicros / 1000000).toStringAsFixed(6)} ${item.currency}',
            ),
          if (item.mood != null) _DetailRow(label: '消费性质', value: item.mood!),
          if (item.note != null && item.note!.trim().isNotEmpty)
            _DetailRow(label: '备注', value: item.note!.trim()),
          if (item.tags.isNotEmpty)
            _DetailRow(label: '标签', value: item.tags.join(' · ')),
          if (item.reimbursable) _DetailRow(label: '报销', value: '待报销'),
          if (!hideAmounts && item.discountAmountCents > 0)
            _DetailRow(
              label: '优惠金额',
              value: _mobileMoney(item.discountAmountCents),
            ),
          if (item.excludeFromBudget) _DetailRow(label: '预算', value: '不计入预算'),
          _DetailRow(
            label: '发生时间',
            value: occurredAt == null
                ? item.occurredAt
                : DateFormat('yyyy-MM-dd HH:mm').format(occurredAt),
          ),
          _DetailRow(label: '来源', value: item.source),
          _DetailRow(
            label: '同步状态',
            value: item.updatedAt == null ? '本地待同步' : '已同步',
          ),
          if (item.updatedAt != null)
            _DetailRow(label: '最后更新', value: item.updatedAt!),
        ],
      ),
    );
  }

  Future<void> _edit() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) => EditTransactionSheet(
        controller: widget.controller,
        item: widget.item,
      ),
    );
    if (mounted) Navigator.pop(context);
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('删除这笔账单？'),
        content: const Text('删除会同步到网页、Windows、macOS 和其他移动设备。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _deleting = true);
    try {
      await widget.controller.deleteTransaction(widget.item);
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('删除失败：$error')));
      }
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: _mobileLine)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 88,
          child: Text(label, style: const TextStyle(color: _mobileMuted)),
        ),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: const TextStyle(color: Colors.white),
          ),
        ),
      ],
    ),
  );
}

class MobileAnalysisPage extends StatelessWidget {
  const MobileAnalysisPage({super.key, required this.controller});

  final LedgerController controller;

  @override
  Widget build(BuildContext context) {
    final page = controller.transactions;
    final analysis = controller.analysis;
    final buckets = analysis?.categoryData ?? _fallbackBuckets(page.items);
    final maxAmount = buckets.isEmpty
        ? 1
        : buckets
              .map((item) => item.amountCents)
              .reduce((a, b) => a > b ? a : b);
    final hideAmounts = controller.preferences.hideAmounts;
    return _MobilePage(
      controller: controller,
      title: '分析',
      trailing: const Icon(Icons.tune_rounded, color: _mobileMuted),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 110),
        children: [
          _InsightCard(
            title: '本月结余',
            value: hideAmounts ? '••••' : _mobileMoney(page.balanceCents),
            caption: analysis == null
                ? '正在同步分类分析…'
                : '储蓄率 ${analysis.savingRate.toStringAsFixed(1)}%',
            icon: Icons.insights_rounded,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _MetricCard(
                  label: '收入',
                  value: hideAmounts ? '••••' : _mobileMoney(page.incomeCents),
                  color: _mobileIncome,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MetricCard(
                  label: '支出',
                  value: hideAmounts ? '••••' : _mobileMoney(page.expenseCents),
                  color: _mobileExpense,
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          _SectionHeader(title: '支出分类', action: '本月'),
          const SizedBox(height: 10),
          if (buckets.isEmpty)
            const _EmptyState(
              icon: Icons.pie_chart_outline_rounded,
              title: '还没有足够数据',
              message: '多记几笔账后，这里会显示你的消费结构。',
            )
          else
            _CategoryChart(
              buckets: buckets,
              maxAmount: maxAmount,
              hideAmounts: hideAmounts,
            ),
          if (analysis?.trend.isNotEmpty == true) ...[
            const SizedBox(height: 24),
            _SectionHeader(title: '收支趋势', action: '近期开销'),
            const SizedBox(height: 10),
            _TrendChart(points: analysis!.trend),
          ],
        ],
      ),
    );
  }
}

class MobileProfilePage extends StatelessWidget {
  const MobileProfilePage({
    super.key,
    required this.controller,
    required this.nativeVersion,
  });

  final LedgerController controller;
  final String nativeVersion;

  @override
  Widget build(BuildContext context) {
    final user = controller.user;
    final accountAssets = controller.accounts
        .where((item) => item.type == '资产')
        .fold<int>(0, (sum, item) => sum + item.balanceCents);
    final liabilityTotal = controller.accounts
        .where((item) => item.type == '负债')
        .fold<int>(0, (sum, item) => sum + item.balanceCents.abs());
    final digitalAssetTotal = controller.assets.fold<int>(
      0,
      (sum, item) => sum + (item.currentValueCents ?? item.valueCents),
    );
    return _MobilePage(
      controller: controller,
      title: '我的',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 110),
        children: [
          _ProfileHeader(user: user, onAvatarTap: () => _pickAvatar(context)),
          const SizedBox(height: 16),
          _NetWorthCard(
            assetTotal: accountAssets + digitalAssetTotal,
            liabilityTotal: liabilityTotal,
            ledgerName: controller.selectedLedger?.name ?? '日常账本',
            hideAmounts: controller.preferences.hideAmounts,
          ),
          const SizedBox(height: 22),
          _SectionHeader(
            title: '我的账本',
            action: '${controller.ledgers.length} 个',
          ),
          const SizedBox(height: 10),
          ...controller.ledgers.map(
            (ledger) => _SettingsRow(
              icon: ledger.icon,
              title: ledger.name,
              subtitle: ledger.id == controller.selectedLedger?.id
                  ? '当前使用中'
                  : '切换账本',
              onTap: () async {
                final index = controller.ledgers.indexOf(ledger);
                if (index >= 0) await controller.selectLedger(index);
              },
            ),
          ),
          const SizedBox(height: 16),
          _SectionHeader(title: '应用', action: 'v$nativeVersion'),
          const SizedBox(height: 10),
          _SettingsRow(
            icon: '☁️',
            title: '同步状态',
            subtitle: controller.totalPendingCount == 0
                ? '已与云端同步'
                : '${controller.totalPendingCount} 笔待同步',
          ),
          _SettingsRow(
            icon: '🧩',
            title: '高级功能',
            subtitle: '预算、订阅、分期与储蓄目标',
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => MobilePlanningPage(controller: controller),
              ),
            ),
          ),
          _SettingsRow(
            icon: '💳',
            title: '账户与资产',
            subtitle:
                '${controller.accounts.length} 个账户 · ${controller.assets.length} 项资产',
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => MobileAccountsPage(controller: controller),
              ),
            ),
          ),
          _SettingsRow(
            icon: '✨',
            title: '记账体验',
            subtitle: '触觉反馈、连续记账与快捷输入',
            onTap: () => showModalBottomSheet<void>(
              context: context,
              showDragHandle: true,
              backgroundColor: _mobileSurface,
              builder: (_) => _MobileExperienceSettings(controller: controller),
            ),
          ),
          _SettingsRow(
            icon: '🧭',
            title: '首页模块',
            subtitle: '开启、关闭和排序首页卡片，设置会跨设备同步',
            onTap: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              backgroundColor: _mobileSurface,
              builder: (_) => _MobileHomeModuleSettings(controller: controller),
            ),
          ),
          _SettingsRow(
            icon: '🔒',
            title: '隐私与安全',
            subtitle: controller.preferences.lockEnabled
                ? '已开启应用锁'
                : '数据仅通过加密连接同步',
            onTap: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              backgroundColor: _mobileSurface,
              builder: (_) => SecuritySheet(controller: controller),
            ),
          ),
          _SettingsRow(
            icon: '⚡️',
            title: '自动记账与导入',
            subtitle: 'Android 自动记账、自动化规则与账单导入',
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => MobileAutomationPage(controller: controller),
              ),
            ),
          ),
          _SettingsRow(
            icon: '🗂️',
            title: '分类管理',
            subtitle: '维护支出与收入分类，历史流水保持不变',
            onTap: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              backgroundColor: _mobileSurface,
              builder: (_) => CategoryManagerSheet(controller: controller),
            ),
          ),
          _SettingsRow(
            icon: '🛡️',
            title: '数据与备份',
            subtitle: '导出、恢复、预检和同步待处理流水',
            onTap: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              backgroundColor: _mobileSurface,
              builder: (_) => DataCenterSheet(controller: controller),
            ),
          ),
          const SizedBox(height: 18),
          OutlinedButton.icon(
            onPressed: controller.loading
                ? null
                : () => _confirmMobileLogout(context, controller),
            icon: const Icon(Icons.logout_rounded),
            label: const Text('退出当前账号'),
            style: OutlinedButton.styleFrom(
              foregroundColor: _mobileExpense,
              side: const BorderSide(color: Color(0x55ff8a7a)),
              minimumSize: const Size.fromHeight(52),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickAvatar(BuildContext context) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('从相册选择'),
              onTap: () => Navigator.pop(context, 'pick'),
            ),
            if (controller.user?.avatarUrl != null)
              ListTile(
                leading: const Icon(Icons.delete_outline_rounded),
                title: const Text('删除头像'),
                onTap: () => Navigator.pop(context, 'remove'),
              ),
          ],
        ),
      ),
    );
    if (!context.mounted || action == null) return;
    if (action == 'remove') {
      try {
        await controller.updateAvatar(null);
      } catch (error) {
        if (context.mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('删除头像失败：$error')));
        }
      }
      return;
    }
    PlatformFile? file;
    try {
      // Use an explicit allow-list instead of FileType.image. On some desktop
      // and Android picker implementations the broad type filter returns an
      // unsupported provider result and the native picker can terminate the
      // process before Flutter receives a normal error.
      file = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp'],
      );
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('打开图片选择器失败：$error')));
      }
      return;
    }
    if (!context.mounted || file == null) return;
    late final List<int> bytes;
    try {
      bytes = await file.readAsBytes();
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('读取头像失败：$error')));
      }
      return;
    }
    if (!context.mounted) return;
    if (bytes.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('无法读取所选图片')));
      return;
    }
    if (bytes.length > 512 * 1024) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('头像图片不能超过 512 KB')));
      return;
    }
    final extension = (file.extension ?? '').toLowerCase();
    final mime = switch (extension) {
      'png' => 'image/png',
      'webp' => 'image/webp',
      'jpg' || 'jpeg' || '' => 'image/jpeg',
      _ => null,
    };
    if (mime == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请选择 JPG、PNG 或 WebP 图片')));
      return;
    }
    try {
      await controller.updateAvatar('data:$mime;base64,${base64Encode(bytes)}');
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('上传头像失败：$error')));
      }
    }
  }
}

class MobileAutomationPage extends StatefulWidget {
  const MobileAutomationPage({super.key, required this.controller});

  final LedgerController controller;

  @override
  State<MobileAutomationPage> createState() => _MobileAutomationPageState();
}

class _MobileAutomationPageState extends State<MobileAutomationPage> {
  Map<String, dynamic> status = const {};
  bool loading = false;
  bool actionBusy = false;

  @override
  void initState() {
    super.initState();
    _refreshStatus();
  }

  Future<void> _refreshStatus() async {
    if (!widget.controller.isAndroid || loading) return;
    setState(() => loading = true);
    try {
      final next = await widget.controller.androidCaptureStatus();
      if (mounted) setState(() => status = next);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('读取自动记账状态失败：$error')));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _systemAction(
    String label,
    Future<void> Function() action,
  ) async {
    if (actionBusy) return;
    setState(() => actionBusy = true);
    try {
      await action();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$label失败：$error')));
      }
    } finally {
      if (mounted) setState(() => actionBusy = false);
    }
  }

  void _openSheet(Widget child) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) => child,
    );
  }

  Widget _statusLine(String label, bool enabled) {
    return Row(
      children: [
        Icon(
          enabled ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
          size: 18,
          color: enabled ? _mobileIncome : _mobileMuted,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              color: enabled ? Colors.white : _mobileMuted,
              fontSize: 13,
            ),
          ),
        ),
      ],
    );
  }

  Widget _card({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _mobileBoxDecoration(),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    final android = widget.controller.isAndroid;
    final configured = status['configured'] == true;
    final notificationEnabled = status['notificationEnabled'] == true;
    final accessibilityEnabled = status['accessibilityEnabled'] == true;
    final pending = (status['pending'] as num?)?.toInt() ?? 0;
    final rulesCount = widget.controller.automationRules.length;

    return _MobilePage(
      controller: widget.controller,
      title: '自动记账与导入',
      trailing: IconButton(
        tooltip: '刷新状态',
        onPressed: loading ? null : _refreshStatus,
        icon: const Icon(Icons.refresh_rounded, color: _mobileMuted),
      ),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 36),
        children: [
          _card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '自动记账',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  android
                      ? '只在你授权的通知和无障碍范围内识别支付结果，数据仍写入当前账本。'
                      : 'Android 支付识别需要系统级权限；其他平台可使用统一的自动化规则和账单导入。',
                  style: const TextStyle(color: _mobileMuted, height: 1.45),
                ),
                const SizedBox(height: 16),
                if (android) ...[
                  _statusLine('连接配置', configured),
                  const SizedBox(height: 9),
                  _statusLine('通知使用权', notificationEnabled),
                  const SizedBox(height: 9),
                  _statusLine('无障碍服务', accessibilityEnabled),
                  const SizedBox(height: 9),
                  _statusLine('待发送账单：$pending 条', pending == 0),
                  const SizedBox(height: 14),
                  FilledButton.icon(
                    onPressed: actionBusy
                        ? null
                        : () => _openSheet(
                            SettingsSheet(controller: widget.controller),
                          ),
                    icon: const Icon(Icons.tune_rounded),
                    label: const Text('打开自动记账配置'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: actionBusy
                        ? null
                        : () => _systemAction(
                            '打开通知使用权设置',
                            widget.controller.openAndroidNotificationSettings,
                          ),
                    icon: const Icon(Icons.notifications_outlined),
                    label: const Text('通知使用权'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: actionBusy
                        ? null
                        : () => _systemAction(
                            '打开无障碍设置',
                            widget.controller.openAndroidAccessibilitySettings,
                          ),
                    icon: const Icon(Icons.accessibility_new_rounded),
                    label: const Text('无障碍服务'),
                  ),
                ] else
                  const Text(
                    '当前设备不提供 Android 系统支付识别权限。iOS/iPadOS 也不能在后台读取其他应用的通知或界面，需要通过系统分享、剪贴板或文件导入主动提交内容。你仍可以使用下面的规则、导入和备份能力，数据与桌面端保持一致。',
                    style: TextStyle(color: _mobileMuted, height: 1.45),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _SettingsRow(
            icon: '🧠',
            title: '自动化规则',
            subtitle: '$rulesCount 条规则 · 商户、金额和分类自动匹配',
            onTap: () =>
                _openSheet(AutomationRulesSheet(controller: widget.controller)),
          ),
          _SettingsRow(
            icon: '📥',
            title: '导入账单',
            subtitle: '支持 JSON、CSV，先预览检查再写入',
            onTap: () => _openSheet(ImportSheet(controller: widget.controller)),
          ),
          _SettingsRow(
            icon: '🗄️',
            title: '备份与恢复',
            subtitle: '生成完整备份，并支持恢复预检',
            onTap: () =>
                _openSheet(DataCenterSheet(controller: widget.controller)),
          ),
          const SizedBox(height: 16),
          const Text(
            '隐私说明：自动记账只处理被授权的支付通知或无障碍事件；账单导入会先解析并展示预览，确认后才提交到当前账本。',
            style: TextStyle(color: _mobileMuted, fontSize: 12, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class MobilePlanningPage extends StatefulWidget {
  const MobilePlanningPage({super.key, required this.controller});

  final LedgerController controller;

  @override
  State<MobilePlanningPage> createState() => _MobilePlanningPageState();
}

class _MobilePlanningPageState extends State<MobilePlanningPage> {
  LedgerController get controller => widget.controller;

  @override
  Widget build(BuildContext context) {
    final recurringTotal = controller.subscriptions.fold<int>(
      0,
      (sum, item) => sum + item.amountCents,
    );
    final budgetTotal = controller.budgets.fold<int>(
      0,
      (sum, item) => sum + item.amountCents,
    );
    return Scaffold(
      backgroundColor: _mobileBg,
      appBar: AppBar(title: const Text('规划与目标')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: _mobileBrand,
        foregroundColor: _mobileBg,
        onPressed: _showAddActions,
        icon: const Icon(Icons.add_rounded),
        label: const Text('新增'),
      ),
      body: RefreshIndicator(
        onRefresh: controller.refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 110),
          children: [
            _PlanningSummaryCard(
              budgetTotal: budgetTotal,
              recurringTotal: recurringTotal,
              goalCount: controller.savingsGoals.length,
            ),
            const SizedBox(height: 18),
            _PlanningSection(
              title: '分类预算',
              icon: Icons.track_changes_outlined,
              actionLabel: '新增预算',
              onAction: () => _openBudget(),
              child: controller.budgets.isEmpty
                  ? const _CompactEmpty(message: '还没有分类预算')
                  : Column(
                      children: [
                        _BudgetTotalCard(
                          budgets: controller.budgets,
                          spent: {
                            for (final bucket
                                in controller.analysis?.categoryData ??
                                    const [])
                              bucket.name: bucket.amountCents,
                          },
                          hideAmounts: controller.preferences.hideAmounts,
                        ),
                        const SizedBox(height: 10),
                        for (final budget in controller.budgets)
                          _BudgetRow(
                            budget: budget,
                            spentCents: _categorySpent(budget.category),
                            onTap: () => _openBudget(budget),
                            hideAmounts: controller.preferences.hideAmounts,
                          ),
                      ],
                    ),
            ),
            const SizedBox(height: 18),
            _PlanningSection(
              title: '固定订阅',
              icon: Icons.autorenew_rounded,
              actionLabel: '新增订阅',
              onAction: () => _openSubscription(),
              child: controller.subscriptions.isEmpty
                  ? const _CompactEmpty(message: '还没有固定订阅')
                  : Column(
                      children: [
                        for (final item in controller.subscriptions)
                          _PlanningItemCard(
                            icon: Icons.autorenew_rounded,
                            title: item.name,
                            subtitle:
                                '${item.cycle} · ${item.category ?? '未分类'}${item.nextChargeDate == null ? '' : ' · 下次 ${item.nextChargeDate}'}',
                            value: controller.preferences.hideAmounts
                                ? '••••'
                                : _mobileMoney(item.amountCents),
                            onEdit: () => _openSubscription(item),
                            onDelete: () => _deleteSubscription(item),
                          ),
                      ],
                    ),
            ),
            const SizedBox(height: 18),
            _PlanningSection(
              title: '分期计划',
              icon: Icons.payments_outlined,
              actionLabel: '新增分期',
              onAction: () => _openInstallment(),
              child: controller.installments.isEmpty
                  ? const _CompactEmpty(message: '还没有分期计划')
                  : Column(
                      children: [
                        for (final item in controller.installments)
                          _PlanningItemCard(
                            icon: Icons.payments_outlined,
                            title: item.name,
                            subtitle:
                                '剩余 ${item.remainingPeriods}/${item.periods} 期 · 每月 ${controller.preferences.hideAmounts ? '••••' : _mobileMoney(item.periods == 0 ? 0 : (item.totalAmountCents + item.feeAmountCents) ~/ item.periods)}',
                            value: controller.preferences.hideAmounts
                                ? '••••'
                                : _mobileMoney(item.totalAmountCents),
                            onDelete: () => _deleteInstallment(item),
                          ),
                      ],
                    ),
            ),
            const SizedBox(height: 18),
            _PlanningSection(
              title: '储蓄目标',
              icon: Icons.savings_outlined,
              actionLabel: '新增目标',
              onAction: () => _openGoal(),
              child: controller.savingsGoals.isEmpty
                  ? const _CompactEmpty(message: '还没有储蓄目标')
                  : Column(
                      children: [
                        for (final goal in controller.savingsGoals)
                          _SavingsGoalCard(
                            goal: goal,
                            onTap: () => _openGoal(goal),
                            hideAmounts: controller.preferences.hideAmounts,
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  int _categorySpent(String category) =>
      (controller.analysis?.categoryData ?? const [])
          .where((bucket) => bucket.name == category)
          .fold<int>(0, (sum, bucket) => sum + bucket.amountCents);

  Future<void> _showAddActions() async {
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.track_changes_outlined),
              title: const Text('新增分类预算'),
              onTap: () => Navigator.pop(sheetContext, 'budget'),
            ),
            ListTile(
              leading: const Icon(Icons.autorenew_rounded),
              title: const Text('新增固定订阅'),
              onTap: () => Navigator.pop(sheetContext, 'subscription'),
            ),
            ListTile(
              leading: const Icon(Icons.payments_outlined),
              title: const Text('新增分期计划'),
              onTap: () => Navigator.pop(sheetContext, 'installment'),
            ),
            ListTile(
              leading: const Icon(Icons.savings_outlined),
              title: const Text('新增储蓄目标'),
              onTap: () => Navigator.pop(sheetContext, 'goal'),
            ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    switch (action) {
      case 'budget':
        await _openBudget();
      case 'subscription':
        await _openSubscription();
      case 'installment':
        await _openInstallment();
      case 'goal':
        await _openGoal();
    }
  }

  Future<void> _openBudget([CategoryBudget? existing]) async {
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) =>
          _MobileBudgetEditor(controller: controller, existing: existing),
    );
    if (mounted) setState(() {});
  }

  Future<void> _openSubscription([Subscription? existing]) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) =>
          SubscriptionSheet(controller: controller, existing: existing),
    );
    if (mounted) setState(() {});
  }

  Future<void> _openInstallment() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) => InstallmentSheet(controller: controller),
    );
    if (mounted) setState(() {});
  }

  Future<void> _openGoal([SavingsGoal? existing]) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) =>
          SavingsGoalSheet(controller: controller, existing: existing),
    );
    if (mounted) setState(() {});
  }

  Future<void> _deleteSubscription(Subscription item) async {
    final confirmed = await _confirm(
      title: '删除固定订阅？',
      message: '删除“${item.name}”后，不会再出现在规划提醒中。',
    );
    if (confirmed != true) return;
    try {
      await controller.deleteSubscription(item);
      if (mounted) setState(() {});
    } catch (error) {
      _showError('删除订阅失败：$error');
    }
  }

  Future<void> _deleteInstallment(Installment item) async {
    final confirmed = await _confirm(
      title: '删除分期计划？',
      message: '“${item.name}”尚未处理的规划记录将被移除，已生成的流水不会回滚。',
    );
    if (confirmed != true) return;
    try {
      await controller.deleteInstallment(item);
      if (mounted) setState(() {});
    } catch (error) {
      _showError('删除分期失败：$error');
    }
  }

  Future<bool?> _confirm({required String title, required String message}) =>
      showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: Text(title),
          content: Text(message),
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

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }
}

class _PlanningSummaryCard extends StatelessWidget {
  const _PlanningSummaryCard({
    required this.budgetTotal,
    required this.recurringTotal,
    required this.goalCount,
  });

  final int budgetTotal;
  final int recurringTotal;
  final int goalCount;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: _mobileBoxDecoration(
      gradient: const LinearGradient(
        colors: [Color(0xff2d3c2b), Color(0xff202a2b)],
      ),
    ),
    child: Row(
      children: [
        Expanded(
          child: _SummaryValue(
            label: '预算额度',
            amount: budgetTotal,
            color: _mobileBrand,
          ),
        ),
        Expanded(
          child: _SummaryValue(
            label: '固定月度支出',
            amount: recurringTotal,
            color: _mobileExpense,
          ),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '储蓄目标',
                style: TextStyle(color: _mobileMuted, fontSize: 12),
              ),
              const SizedBox(height: 4),
              Text(
                '$goalCount 个',
                style: const TextStyle(
                  color: _mobilePurple,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _PlanningSection extends StatelessWidget {
  const _PlanningSection({
    required this.title,
    required this.icon,
    required this.actionLabel,
    required this.onAction,
    required this.child,
  });

  final String title;
  final IconData icon;
  final String actionLabel;
  final VoidCallback onAction;
  final Widget child;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        children: [
          Icon(icon, color: _mobileBrand, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              title,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
          ),
          TextButton(onPressed: onAction, child: Text(actionLabel)),
        ],
      ),
      const SizedBox(height: 8),
      child,
    ],
  );
}

class _PlanningItemCard extends StatelessWidget {
  const _PlanningItemCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    this.onEdit,
    this.onDelete,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String value;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 8),
    padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
    decoration: _mobileBoxDecoration(),
    child: Row(
      children: [
        Icon(icon, color: _mobilePurple),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(
                subtitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: _mobileMuted, fontSize: 12),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
        PopupMenuButton<String>(
          onSelected: (action) {
            if (action == 'edit') onEdit?.call();
            if (action == 'delete') onDelete?.call();
          },
          itemBuilder: (context) => [
            if (onEdit != null)
              const PopupMenuItem(value: 'edit', child: Text('编辑')),
            if (onDelete != null)
              const PopupMenuItem(value: 'delete', child: Text('删除')),
          ],
        ),
      ],
    ),
  );
}

class _SavingsGoalCard extends StatelessWidget {
  const _SavingsGoalCard({
    required this.goal,
    required this.onTap,
    required this.hideAmounts,
  });

  final SavingsGoal goal;
  final VoidCallback onTap;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(18),
    child: Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(16),
      decoration: _mobileBoxDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(goal.icon ?? '🎯', style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  goal.name,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              Text(
                hideAmounts
                    ? '•••• / ••••'
                    : '${_mobileMoney(goal.savedAmountCents)} / ${_mobileMoney(goal.targetAmountCents)}',
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              minHeight: 8,
              value: goal.progress,
              backgroundColor: const Color(0x24ffffff),
              valueColor: const AlwaysStoppedAnimation(_mobilePurple),
            ),
          ),
          if (goal.deadline != null) ...[
            const SizedBox(height: 7),
            Text(
              '目标日期：${goal.deadline}',
              style: const TextStyle(color: _mobileMuted, fontSize: 12),
            ),
          ],
        ],
      ),
    ),
  );
}

class _CompactEmpty extends StatelessWidget {
  const _CompactEmpty({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: _mobileBoxDecoration(),
    child: Row(
      children: [
        const Icon(Icons.inbox_outlined, color: _mobileMuted),
        const SizedBox(width: 10),
        Text(message, style: const TextStyle(color: _mobileMuted)),
      ],
    ),
  );
}

class MobileBudgetPage extends StatefulWidget {
  const MobileBudgetPage({super.key, required this.controller});

  final LedgerController controller;

  @override
  State<MobileBudgetPage> createState() => _MobileBudgetPageState();
}

class _MobileBudgetPageState extends State<MobileBudgetPage> {
  LedgerController get controller => widget.controller;

  @override
  Widget build(BuildContext context) {
    final spent = <String, int>{
      for (final bucket in controller.analysis?.categoryData ?? const [])
        bucket.name: bucket.amountCents,
    };
    return Scaffold(
      backgroundColor: _mobileBg,
      appBar: AppBar(title: const Text('预算管理')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: _mobileBrand,
        foregroundColor: _mobileBg,
        onPressed: () => _editBudget(),
        icon: const Icon(Icons.add_rounded),
        label: const Text('新增预算'),
      ),
      body: RefreshIndicator(
        onRefresh: controller.refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 110),
          children: [
            _BudgetTotalCard(
              budgets: controller.budgets,
              spent: spent,
              hideAmounts: controller.preferences.hideAmounts,
            ),
            const SizedBox(height: 18),
            if (controller.budgets.isEmpty)
              const _EmptyState(
                icon: Icons.track_changes_outlined,
                title: '还没有分类预算',
                message: '为餐饮、交通或其他分类设置本月额度。',
              )
            else
              for (final budget in controller.budgets)
                _BudgetRow(
                  budget: budget,
                  spentCents: spent[budget.category] ?? 0,
                  onTap: () => _editBudget(budget),
                  hideAmounts: controller.preferences.hideAmounts,
                ),
          ],
        ),
      ),
    );
  }

  Future<void> _editBudget([CategoryBudget? existing]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) =>
          _MobileBudgetEditor(controller: controller, existing: existing),
    );
    if (saved == true && mounted) setState(() {});
  }
}

class _BudgetTotalCard extends StatelessWidget {
  const _BudgetTotalCard({
    required this.budgets,
    required this.spent,
    required this.hideAmounts,
  });

  final List<CategoryBudget> budgets;
  final Map<String, int> spent;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    final total = budgets.fold<int>(0, (sum, item) => sum + item.amountCents);
    final used = budgets.fold<int>(
      0,
      (sum, item) => sum + (spent[item.category] ?? 0),
    );
    final ratio = total == 0 ? 0.0 : used / total;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: _mobileBoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xff2d3c2b), Color(0xff202a2b)],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('本月预算总览', style: TextStyle(color: _mobileMuted)),
          const SizedBox(height: 8),
          Text(
            hideAmounts
                ? '•••• / ••••'
                : '${_mobileMoney(used)} / ${_mobileMoney(total)}',
            style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              minHeight: 9,
              value: ratio.clamp(0, 1),
              backgroundColor: const Color(0x24ffffff),
              valueColor: AlwaysStoppedAnimation(
                ratio >= 1 ? _mobileExpense : _mobileBrand,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            ratio >= 1
                ? '已超出本月预算'
                : hideAmounts
                ? '剩余金额已隐藏'
                : '还可使用 ${_mobileMoney(total - used)}',
            style: TextStyle(color: ratio >= 1 ? _mobileExpense : _mobileMuted),
          ),
        ],
      ),
    );
  }
}

class _BudgetRow extends StatelessWidget {
  const _BudgetRow({
    required this.budget,
    required this.spentCents,
    required this.onTap,
    required this.hideAmounts,
  });

  final CategoryBudget budget;
  final int spentCents;
  final VoidCallback onTap;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    final ratio = budget.amountCents == 0
        ? 0.0
        : spentCents / budget.amountCents;
    final danger = ratio >= 1;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: _mobileBoxDecoration(),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    budget.category,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
                Text(
                  hideAmounts
                      ? '•••• / ••••'
                      : '${_mobileMoney(spentCents)} / ${_mobileMoney(budget.amountCents)}',
                  style: TextStyle(
                    color: danger ? _mobileExpense : _mobileMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                minHeight: 8,
                value: ratio.clamp(0, 1),
                backgroundColor: const Color(0x24ffffff),
                valueColor: AlwaysStoppedAnimation(
                  danger ? _mobileExpense : _mobileBrand,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MobileBudgetEditor extends StatefulWidget {
  const _MobileBudgetEditor({required this.controller, required this.existing});

  final LedgerController controller;
  final CategoryBudget? existing;

  @override
  State<_MobileBudgetEditor> createState() => _MobileBudgetEditorState();
}

class _MobileBudgetEditorState extends State<_MobileBudgetEditor> {
  late String _category;
  late final TextEditingController _amount;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final categories = widget.controller.expenseCategories;
    _category =
        widget.existing?.category ??
        (categories.isNotEmpty ? categories.first.name : '餐饮');
    _amount = TextEditingController(
      text: widget.existing == null
          ? ''
          : (widget.existing!.amountCents / 100).toStringAsFixed(2),
    );
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        18,
        4,
        18,
        MediaQuery.viewInsetsOf(context).bottom + 22,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.existing == null ? '新增分类预算' : '编辑分类预算',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _category,
            decoration: const InputDecoration(labelText: '分类'),
            items: [
              for (final category in widget.controller.expenseCategories)
                DropdownMenuItem(
                  value: category.name,
                  child: Text(category.name),
                ),
              if (!widget.controller.expenseCategories.any(
                (category) => category.name == _category,
              ))
                DropdownMenuItem(value: _category, child: Text(_category)),
              if (widget.controller.expenseCategories.isEmpty &&
                  _category != '餐饮')
                const DropdownMenuItem(value: '餐饮', child: Text('餐饮')),
            ],
            onChanged: _saving
                ? null
                : (value) => setState(() => _category = value ?? _category),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: '每月额度'),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('保存预算'),
          ),
        ],
      ),
    ),
  );

  Future<void> _save() async {
    final amount = double.tryParse(_amount.text.trim());
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请输入大于 0 的预算金额')));
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.controller.saveBudget(category: _category, amount: amount);
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存预算失败：$error')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class MobileAccountsPage extends StatefulWidget {
  const MobileAccountsPage({super.key, required this.controller});

  final LedgerController controller;

  @override
  State<MobileAccountsPage> createState() => _MobileAccountsPageState();
}

class _MobileAccountsPageState extends State<MobileAccountsPage> {
  LedgerController get controller => widget.controller;

  @override
  Widget build(BuildContext context) {
    final recentByAccount = <int, TransactionItem>{};
    for (final item in controller.transactions.items) {
      recentByAccount.putIfAbsent(item.accountId, () => item);
    }
    final pendingByAccount = <int, int>{};
    for (final item in controller.queue) {
      pendingByAccount.update(
        item.accountId,
        (count) => count + 1,
        ifAbsent: () => 1,
      );
    }
    for (final item in controller.pendingTransactions.items) {
      pendingByAccount.update(
        item.accountId,
        (count) => count + 1,
        ifAbsent: () => 1,
      );
    }
    final hideAmounts = controller.preferences.hideAmounts;
    final assetGroups = <String, List<Account>>{};
    for (final account in controller.accounts.where(
      (item) => item.type == '资产',
    )) {
      final group = account.isInvestment
          ? '投资账户'
          : account.assetClass.trim().isEmpty
          ? '现金流账户'
          : account.assetClass;
      assetGroups.putIfAbsent(group, () => []).add(account);
    }
    final liabilities = controller.accounts
        .where((item) => item.type == '负债')
        .toList();
    return Scaffold(
      backgroundColor: _mobileBg,
      appBar: AppBar(
        title: const Text('账户与资产'),
        actions: [
          IconButton(
            tooltip: '新增数字资产',
            onPressed: () => _editAsset(),
            icon: const Icon(Icons.category_outlined),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: _mobileBrand,
        foregroundColor: _mobileBg,
        onPressed: () => _editAccount(),
        icon: const Icon(Icons.add_rounded),
        label: const Text('新增账户'),
      ),
      body: RefreshIndicator(
        onRefresh: controller.refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 110),
          children: [
            if (assetGroups.isEmpty)
              _AccountGroup(
                title: '资产账户',
                accounts: const [],
                onEdit: _editAccount,
                onDelete: _deleteAccount,
                onMove: _moveAccount,
                onShowTransfers: _showAccountTransfers,
                recentByAccount: recentByAccount,
                pendingByAccount: pendingByAccount,
                hideAmounts: hideAmounts,
              )
            else
              for (final group in assetGroups.entries) ...[
                _AccountGroup(
                  title: group.key,
                  accounts: group.value,
                  onEdit: _editAccount,
                  onDelete: _deleteAccount,
                  onMove: _moveAccount,
                  onShowTransfers: _showAccountTransfers,
                  recentByAccount: recentByAccount,
                  pendingByAccount: pendingByAccount,
                  hideAmounts: hideAmounts,
                ),
                const SizedBox(height: 18),
              ],
            _AccountGroup(
              title: '负债账户',
              accounts: liabilities,
              onEdit: _editAccount,
              onDelete: _deleteAccount,
              onMove: _moveAccount,
              onShowTransfers: _showAccountTransfers,
              recentByAccount: recentByAccount,
              pendingByAccount: pendingByAccount,
              hideAmounts: hideAmounts,
            ),
            if (controller.assets.isNotEmpty) ...[
              const SizedBox(height: 18),
              _SectionHeader(
                title: '数字资产',
                action: '${controller.assets.length} 项',
              ),
              const SizedBox(height: 8),
              for (final asset in controller.assets)
                _MobileAssetRow(
                  asset: asset,
                  onEdit: () => _editAsset(asset),
                  onLiquidate: () => _liquidateAsset(asset),
                  hideAmounts: hideAmounts,
                ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _editAccount([Account? account]) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) =>
          _MobileAccountEditor(controller: controller, existing: account),
    );
    if (saved == true && mounted) setState(() {});
  }

  Future<void> _deleteAccount(Account account) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('删除“${account.name}”？'),
        content: const Text('删除账户前请确认没有需要保留的关联流水；服务端会按规则拒绝产生孤立流水。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await controller.deleteAccount(account);
      if (mounted) setState(() {});
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('删除失败：$error')));
      }
    }
  }

  Future<void> _moveAccount(
    List<Account> groupAccounts,
    Account account,
    int delta,
  ) async {
    final peers = groupAccounts
        .where((item) => item.isActive == account.isActive)
        .toList();
    final index = peers.indexWhere((item) => item.id == account.id);
    final nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= peers.length) return;
    final reorderedPeers = [...peers];
    final moved = reorderedPeers.removeAt(index);
    reorderedPeers.insert(nextIndex, moved);
    final peerIds = reorderedPeers.map((item) => item.id).toSet();
    final groupIds = groupAccounts.map((item) => item.id).toSet();
    final reorderedGroup = <Account>[];
    var peerIndex = 0;
    for (final item in groupAccounts) {
      if (peerIds.contains(item.id)) {
        reorderedGroup.add(reorderedPeers[peerIndex++]);
      } else {
        reorderedGroup.add(item);
      }
    }
    final all = controller.accounts.toList();
    final positions = <int>[];
    for (var i = 0; i < all.length; i++) {
      if (groupIds.contains(all[i].id)) positions.add(i);
    }
    for (var i = 0; i < positions.length; i++) {
      all[positions[i]] = reorderedGroup[i];
    }
    try {
      await controller.reorderAccounts(all.map((item) => item.id).toList());
      if (mounted) setState(() {});
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('账户排序失败：$error')));
      }
    }
  }

  Future<void> _showAccountTransfers(Account account) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) => _AccountTransferHistorySheet(
        account: account,
        hideAmounts: controller.preferences.hideAmounts,
        history: controller.fetchAccountTransfers(account.id),
      ),
    );
  }

  Future<void> _editAsset([DigitalAsset? asset]) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) => AssetSheet(controller: controller, existing: asset),
    );
    if (mounted) setState(() {});
  }

  Future<void> _liquidateAsset(DigitalAsset asset) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) =>
          AssetLiquidationSheet(controller: controller, asset: asset),
    );
    if (mounted) setState(() {});
  }
}

class _MobileAssetRow extends StatelessWidget {
  const _MobileAssetRow({
    required this.asset,
    required this.onEdit,
    required this.onLiquidate,
    required this.hideAmounts,
  });

  final DigitalAsset asset;
  final VoidCallback onEdit;
  final VoidCallback onLiquidate;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    final icon = asset.assetType == '房产'
        ? '🏠'
        : asset.assetType == '车辆'
        ? '🚗'
        : asset.assetType == '贵金属'
        ? '💎'
        : '📦';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: _mobileBoxDecoration(),
      child: ListTile(
        onTap: onEdit,
        leading: Text(icon, style: const TextStyle(fontSize: 22)),
        title: Text(asset.name),
        subtitle: Text(
          '${asset.assetType} · ${asset.currency} · ${asset.valuationMode ?? '手动估值'}',
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              hideAmounts
                  ? '••••'
                  : _mobileMoney(asset.currentValueCents ?? asset.valueCents),
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            PopupMenuButton<String>(
              onSelected: (value) {
                if (value == 'edit') onEdit();
                if (value == 'liquidate') onLiquidate();
              },
              itemBuilder: (context) => const [
                PopupMenuItem(value: 'edit', child: Text('编辑资产')),
                PopupMenuItem(value: 'liquidate', child: Text('变现/注销')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AccountGroup extends StatelessWidget {
  const _AccountGroup({
    required this.title,
    required this.accounts,
    required this.onEdit,
    required this.onDelete,
    required this.onMove,
    required this.onShowTransfers,
    required this.recentByAccount,
    required this.pendingByAccount,
    required this.hideAmounts,
  });

  final String title;
  final List<Account> accounts;
  final Future<void> Function([Account?]) onEdit;
  final Future<void> Function(Account) onDelete;
  final Future<void> Function(List<Account>, Account, int) onMove;
  final Future<void> Function(Account) onShowTransfers;
  final Map<int, TransactionItem> recentByAccount;
  final Map<int, int> pendingByAccount;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(title: title, action: '${accounts.length} 个'),
        const SizedBox(height: 8),
        if (accounts.isEmpty)
          const _EmptyState(
            icon: Icons.account_balance_wallet_outlined,
            title: '暂无账户',
            message: '新增一个账户后就可以开始记账。',
          )
        else
          for (final entry in accounts.asMap().entries)
            Dismissible(
              key: ValueKey(entry.value.id),
              direction: DismissDirection.endToStart,
              confirmDismiss: (_) async {
                await onDelete(entry.value);
                return false;
              },
              background: Container(
                alignment: Alignment.centerRight,
                padding: const EdgeInsets.only(right: 20),
                margin: const EdgeInsets.only(bottom: 8),
                decoration: BoxDecoration(
                  color: _mobileExpense.withAlpha(35),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Icon(Icons.delete_outline_rounded),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: _SettingsRow(
                      icon: entry.value.icon,
                      title: entry.value.name,
                      subtitle: [
                        '${entry.value.type} · ${entry.value.currency} · ${hideAmounts ? '••••' : _mobileMoney(entry.value.balanceCents)}',
                        if (!entry.value.isActive) '已停用 · 历史流水保留',
                        if (recentByAccount[entry.value.id] case final recent?)
                          '最近：${recent.title}',
                        if ((pendingByAccount[entry.value.id] ?? 0) > 0)
                          '待同步/确认：${pendingByAccount[entry.value.id]} 条',
                      ].join(' · '),
                      onTap: () => onEdit(entry.value),
                    ),
                  ),
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        tooltip: '查看转账记录',
                        visualDensity: VisualDensity.compact,
                        onPressed: () => onShowTransfers(entry.value),
                        icon: const Icon(Icons.receipt_long_outlined),
                      ),
                      IconButton(
                        tooltip: '上移账户',
                        visualDensity: VisualDensity.compact,
                        onPressed:
                            entry.key == 0 ||
                                accounts[entry.key - 1].isActive !=
                                    entry.value.isActive
                            ? null
                            : () => onMove(accounts, entry.value, -1),
                        icon: const Icon(Icons.keyboard_arrow_up_rounded),
                      ),
                      IconButton(
                        tooltip: '下移账户',
                        visualDensity: VisualDensity.compact,
                        onPressed:
                            entry.key == accounts.length - 1 ||
                                accounts[entry.key + 1].isActive !=
                                    entry.value.isActive
                            ? null
                            : () => onMove(accounts, entry.value, 1),
                        icon: const Icon(Icons.keyboard_arrow_down_rounded),
                      ),
                    ],
                  ),
                ],
              ),
            ),
      ],
    );
  }
}

class _AccountTransferHistorySheet extends StatelessWidget {
  const _AccountTransferHistorySheet({
    required this.account,
    required this.hideAmounts,
    required this.history,
  });

  final Account account;
  final bool hideAmounts;
  final Future<List<AccountTransfer>> history;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: SizedBox(
      height: MediaQuery.sizeOf(context).height * .72,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '${account.name} · 转账记录',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            Expanded(
              child: FutureBuilder<List<AccountTransfer>>(
                future: history,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snapshot.hasError) {
                    return Center(child: Text('读取转账记录失败：${snapshot.error}'));
                  }
                  final records = snapshot.data ?? const <AccountTransfer>[];
                  if (records.isEmpty) {
                    return const Center(child: Text('这个账户还没有转账记录'));
                  }
                  return ListView.separated(
                    itemCount: records.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final item = records[index];
                      final from = item.fromAccountName ?? '外部';
                      final to = item.toAccountName ?? '外部';
                      final amount = hideAmounts
                          ? '••••'
                          : _mobileMoneyCurrency(
                              item.amountCents,
                              item.currency,
                            );
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.swap_horiz_rounded),
                        title: Text(
                          item.note.trim().isEmpty ? item.kind : item.note,
                        ),
                        subtitle: Text(
                          '$from → $to · ${_mobileDate(item.occurredAt)}',
                        ),
                        trailing: Text(
                          amount,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      );
                    },
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

class _MobileAccountEditor extends StatefulWidget {
  const _MobileAccountEditor({
    required this.controller,
    required this.existing,
  });

  final LedgerController controller;
  final Account? existing;

  @override
  State<_MobileAccountEditor> createState() => _MobileAccountEditorState();
}

class _MobileAccountEditorState extends State<_MobileAccountEditor> {
  late final TextEditingController _name;
  late final TextEditingController _balance;
  late String _type;
  late String _currency;
  late String _assetClass;
  late bool _investment;
  late bool _isActive;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final account = widget.existing;
    _name = TextEditingController(text: account?.name ?? '');
    _balance = TextEditingController(
      text: account == null
          ? ''
          : (account.balanceCents.abs() / 100).toStringAsFixed(2),
    );
    _type = account?.type ?? '资产';
    _currency = account?.currency ?? 'CNY';
    _assetClass = account?.assetClass ?? '现金流';
    _investment = account?.isInvestment ?? false;
    _isActive = account?.isActive ?? true;
  }

  @override
  void dispose() {
    _name.dispose();
    _balance.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        18,
        4,
        18,
        MediaQuery.viewInsetsOf(context).bottom + 22,
      ),
      child: ListView(
        shrinkWrap: true,
        children: [
          Text(
            widget.existing == null ? '新增账户' : '编辑账户',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: '账户名称'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _balance,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: '当前余额'),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _type,
            decoration: const InputDecoration(labelText: '账户类型'),
            items: const [
              DropdownMenuItem(value: '资产', child: Text('资产')),
              DropdownMenuItem(value: '负债', child: Text('负债')),
            ],
            onChanged: _saving
                ? null
                : (value) => setState(() => _type = value ?? '资产'),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _currency,
            decoration: const InputDecoration(labelText: '币种'),
            items: const [
              DropdownMenuItem(value: 'CNY', child: Text('CNY 人民币')),
              DropdownMenuItem(value: 'USD', child: Text('USD 美元')),
              DropdownMenuItem(value: 'JPY', child: Text('JPY 日元')),
              DropdownMenuItem(value: 'EUR', child: Text('EUR 欧元')),
            ],
            onChanged: _saving
                ? null
                : (value) => setState(() => _currency = value ?? 'CNY'),
          ),
          const SizedBox(height: 10),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: const Text('投资账户'),
            value: _investment,
            onChanged: _saving
                ? null
                : (value) => setState(() => _investment = value),
          ),
          if (widget.existing != null)
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('启用账户'),
              subtitle: const Text('停用后保留历史记录，但不能用于新流水和转账'),
              value: _isActive,
              onChanged: _saving
                  ? null
                  : (value) => setState(() => _isActive = value),
            ),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('保存账户'),
          ),
        ],
      ),
    ),
  );

  Future<void> _save() async {
    final balance = double.tryParse(_balance.text.trim());
    if (_name.text.trim().isEmpty || balance == null || balance < 0) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请输入账户名称和有效余额')));
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.controller.saveAccount(
        existing: widget.existing,
        name: _name.text,
        type: _type,
        balance: balance,
        isInvestment: _investment,
        currency: _currency,
        assetClass: _assetClass,
        isActive: _isActive,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存失败：$error')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class MobileAddTransactionPage extends StatefulWidget {
  const MobileAddTransactionPage({
    super.key,
    required this.controller,
    this.initialType = '支出',
  });

  final LedgerController controller;
  final String initialType;

  @override
  State<MobileAddTransactionPage> createState() =>
      _MobileAddTransactionPageState();
}

class _MobileHomeModuleSettings extends StatefulWidget {
  const _MobileHomeModuleSettings({required this.controller});

  final LedgerController controller;

  @override
  State<_MobileHomeModuleSettings> createState() =>
      _MobileHomeModuleSettingsState();
}

class _MobileHomeModuleSettingsState extends State<_MobileHomeModuleSettings> {
  static const _defaults = [
    'summary',
    'weeklyTrend',
    'budget',
    'pending',
    'recent',
  ];
  static const _labels = {
    'summary': ('本月收支', '收入、支出和结余概览'),
    'weeklyTrend': ('近 7 日支出', '查看最近一周的消费趋势'),
    'budget': ('预算进度', '显示分类预算使用情况'),
    'pending': ('待确认账单', '显示自动识别后等待确认的流水'),
    'recent': ('最近账单', '显示最近发生的流水'),
  };

  late List<String> _modules;
  late Set<String> _enabled;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final stored = widget.controller.preferences.homeModules;
    _modules = [
      ...stored.where(_defaults.contains),
      ..._defaults.where((item) => !stored.contains(item)),
    ];
    _enabled = stored.isEmpty ? _defaults.toSet() : stored.toSet();
  }

  Future<void> _save() async {
    if (_enabled.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('至少保留一个首页模块')));
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.controller.saveMobileSettings(
        homeModules: _modules.where(_enabled.contains).toList(),
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('首页模块设置失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(18, 4, 18, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            '首页模块',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          const Text(
            '拖动调整顺序，关闭后不会再占用首页空间；设置会同步到其他设备。',
            style: TextStyle(color: _mobileMuted, height: 1.4),
          ),
          const SizedBox(height: 10),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 360),
            child: ReorderableListView.builder(
              shrinkWrap: true,
              itemCount: _modules.length,
              onReorderItem: (oldIndex, newIndex) {
                setState(() {
                  final item = _modules.removeAt(oldIndex);
                  _modules.insert(newIndex, item);
                });
              },
              itemBuilder: (context, index) {
                final key = _modules[index];
                final definition = _labels[key]!;
                return CheckboxListTile(
                  key: ValueKey(key),
                  value: _enabled.contains(key),
                  onChanged: _saving
                      ? null
                      : (value) => setState(() {
                          if (value == true) {
                            _enabled.add(key);
                          } else {
                            _enabled.remove(key);
                          }
                        }),
                  title: Text(definition.$1),
                  subtitle: Text(
                    definition.$2,
                    style: const TextStyle(color: _mobileMuted, fontSize: 12),
                  ),
                  secondary: const Icon(Icons.drag_handle_rounded),
                  activeColor: _mobileBrand,
                  contentPadding: EdgeInsets.zero,
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: Text(_saving ? '保存中…' : '保存首页布局'),
          ),
        ],
      ),
    ),
  );
}

class _MobileExperienceSettings extends StatefulWidget {
  const _MobileExperienceSettings({required this.controller});

  final LedgerController controller;

  @override
  State<_MobileExperienceSettings> createState() =>
      _MobileExperienceSettingsState();
}

class _MobileExperienceSettingsState extends State<_MobileExperienceSettings> {
  bool _haptics = true;
  bool _continuous = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _haptics = widget.controller.preferences.hapticsEnabled;
        _continuous = widget.controller.preferences.continuousEntry;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(18, 4, 18, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            '记账体验',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: const Text('按键触觉反馈'),
            subtitle: const Text(
              '输入金额时提供轻触反馈',
              style: TextStyle(color: _mobileMuted),
            ),
            value: _haptics,
            onChanged: _loading
                ? null
                : (value) async {
                    setState(() => _haptics = value);
                    try {
                      await widget.controller.saveMobileSettings(
                        hapticsEnabled: value,
                      );
                    } catch (error) {
                      if (context.mounted) {
                        setState(() => _haptics = !value);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('触觉设置失败：$error')),
                        );
                      }
                    }
                    if (value) HapticFeedback.selectionClick();
                  },
          ),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: const Text('默认连续记账'),
            subtitle: const Text(
              '新打开记账页时默认保留账户和日期，保存后继续下一笔',
              style: TextStyle(color: _mobileMuted),
            ),
            value: _continuous,
            onChanged: _loading
                ? null
                : (value) async {
                    setState(() => _continuous = value);
                    try {
                      await widget.controller.saveMobileSettings(
                        continuousEntry: value,
                      );
                    } catch (error) {
                      if (context.mounted) {
                        setState(() => _continuous = !value);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('连续记账设置失败：$error')),
                        );
                      }
                    }
                  },
          ),
          const Text(
            '记账页仍可针对当前操作单独调整；金额动画会自动遵循系统“减少动态效果”设置。',
            style: TextStyle(color: _mobileMuted, height: 1.5),
          ),
        ],
      ),
    ),
  );
}

class _MobileAddTransactionPageState extends State<MobileAddTransactionPage> {
  final _title = TextEditingController();
  final _note = TextEditingController();
  final _tags = TextEditingController();
  final _discountAmount = TextEditingController();
  final _exchangeRate = TextEditingController();
  final _categorySearch = TextEditingController();
  final _entryPreferences = const MobileEntryPreferences();
  late String _type;
  String _amount = '0';
  String _originalCurrency = 'CNY';
  int _exchangeRateMicros = 1000000;
  int? _accountId;
  int? _toAccountId;
  String? _category;
  String _mood = '刚需';
  int? _splitMemberId;
  String _splitMode = '按比例平摊';
  double _mySharePercent = 50;
  DateTime _occurredAt = DateTime.now();
  bool _continuous = false;
  bool _hapticsEnabled = true;
  bool _accountManuallySelected = false;
  bool _reimbursable = false;
  bool _excludeFromBudget = false;
  List<String> _recentCategories = const [];
  bool _saving = false;

  LedgerController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    _type = const ['支出', '收入', '转账'].contains(widget.initialType)
        ? widget.initialType
        : '支出';
    _accountId = controller.activeAccounts.isEmpty
        ? null
        : controller.activeAccounts.first.id;
    _toAccountId = controller.activeAccounts.length < 2
        ? null
        : controller.activeAccounts[1].id;
    _originalCurrency = _accountCurrency;
    _exchangeRateMicros = _rateFor(_originalCurrency, _accountCurrency);
    _exchangeRate.text = _rateText;
    _category = _choices.isEmpty ? null : _choices.first.name;
    _loadEntryPreferences();
  }

  @override
  void dispose() {
    _title.dispose();
    _note.dispose();
    _tags.dispose();
    _discountAmount.dispose();
    _exchangeRate.dispose();
    _categorySearch.dispose();
    super.dispose();
  }

  List<_MobileCategoryChoice> get _choices {
    final source = _type == '支出'
        ? controller.expenseCategories
        : controller.incomeCategories;
    if (source.isNotEmpty) {
      final byId = {for (final item in source) item.id: item};
      return source
          .where((item) => item.isActive)
          .map(
            (item) => _MobileCategoryChoice(
              name: item.name,
              icon: item.icon,
              color: _mobileHex(item.color),
              parentName: item.parentId == null
                  ? null
                  : byId[item.parentId]?.name,
            ),
          )
          .toList();
    }
    final fallback = _type == '支出'
        ? const [
            _MobileCategoryChoice(
              name: '餐饮',
              icon: '🍜',
              color: Color(0xffff9d61),
            ),
            _MobileCategoryChoice(
              name: '交通',
              icon: '🚕',
              color: Color(0xff78a9ff),
            ),
            _MobileCategoryChoice(
              name: '购物',
              icon: '🛍️',
              color: Color(0xffdb8dff),
            ),
            _MobileCategoryChoice(
              name: '日用',
              icon: '🏠',
              color: Color(0xff75d7bd),
            ),
            _MobileCategoryChoice(
              name: '娱乐',
              icon: '🎮',
              color: Color(0xffffcf70),
            ),
            _MobileCategoryChoice(
              name: '其它',
              icon: '🧾',
              color: Color(0xffaab2bf),
            ),
          ]
        : const [
            _MobileCategoryChoice(
              name: '工资',
              icon: '💼',
              color: Color(0xff65d89b),
            ),
            _MobileCategoryChoice(
              name: '奖金',
              icon: '🎁',
              color: Color(0xffffcf70),
            ),
            _MobileCategoryChoice(
              name: '其它收入',
              icon: '💰',
              color: Color(0xff78a9ff),
            ),
          ];
    return fallback;
  }

  List<_MobileCategoryChoice> get _visibleChoices {
    final query = _categorySearch.text.trim().toLowerCase();
    final choices = _choices
        .where(
          (item) =>
              query.isEmpty ||
              item.name.toLowerCase().contains(query) ||
              (item.parentName?.toLowerCase().contains(query) ?? false),
        )
        .toList();
    choices.sort((left, right) {
      final leftIndex = _recentCategories.indexOf(left.name);
      final rightIndex = _recentCategories.indexOf(right.name);
      if (leftIndex >= 0 || rightIndex >= 0) {
        if (leftIndex < 0) return 1;
        if (rightIndex < 0) return -1;
        return leftIndex.compareTo(rightIndex);
      }
      return 0;
    });
    return choices;
  }

  @override
  Widget build(BuildContext context) {
    final choices = _visibleChoices;
    return Scaffold(
      backgroundColor: _mobileBg,
      appBar: AppBar(
        title: const Text('记一笔', style: TextStyle(fontWeight: FontWeight.w800)),
        leading: IconButton(
          onPressed: () => Navigator.pop(context),
          icon: const Icon(Icons.close_rounded),
        ),
        actions: [
          TextButton(
            onPressed: _saving ? null : _save,
            child: const Text(
              '保存',
              style: TextStyle(
                color: _mobileBrand,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
          children: [
            _TypeSwitch(
              value: _type,
              onChanged: (value) {
                setState(() {
                  _type = value;
                  _category = _choices.isEmpty ? null : _choices.first.name;
                });
              },
            ),
            const SizedBox(height: 18),
            _AmountDisplay(
              amount: _amount,
              type: _type,
              currency: _type == '转账' ? _accountCurrency : _originalCurrency,
            ),
            const SizedBox(height: 16),
            _Keypad(onKey: _inputKey),
            if (_type != '转账') ...[
              const SizedBox(height: 16),
              _MobileSelectRow(
                icon: Icons.currency_exchange_rounded,
                title: '原币种',
                value: _originalCurrency,
                onTap: _pickOriginalCurrency,
              ),
              if (_originalCurrency != _accountCurrency) ...[
                const SizedBox(height: 8),
                TextField(
                  controller: _exchangeRate,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  onChanged: (value) {
                    final parsed = double.tryParse(value);
                    if (parsed != null && parsed > 0 && parsed <= 1000000) {
                      setState(
                        () => _exchangeRateMicros = (parsed * 1000000).round(),
                      );
                    }
                  },
                  decoration: InputDecoration(
                    prefixIcon: const Icon(
                      Icons.sync_alt_rounded,
                      color: _mobileMuted,
                    ),
                    labelText: '1 $_originalCurrency = ? $_accountCurrency',
                    helperText:
                        '本位币金额：${_mobileMoney(_baseAmountCents)} $_accountCurrency',
                  ),
                ),
              ],
            ],
            if (_type != '转账') ...[
              const SizedBox(height: 22),
              const _FormLabel(label: '分类'),
              const SizedBox(height: 10),
              TextField(
                controller: _categorySearch,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search_rounded),
                  hintText: '搜索分类',
                ),
              ),
              const SizedBox(height: 10),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: choices.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 4,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 10,
                  childAspectRatio: 1.05,
                ),
                itemBuilder: (context, index) {
                  final choice = choices[index];
                  return _CategoryChoice(
                    choice: choice,
                    selected: _category == choice.name,
                    onTap: () => _selectCategory(choice.name),
                  );
                },
              ),
            ],
            const SizedBox(height: 18),
            _FormLabel(label: _type == '转账' ? '转账信息' : '账户与信息'),
            const SizedBox(height: 10),
            _MobileSelectRow(
              icon: Icons.account_balance_wallet_outlined,
              title: _type == '转账' ? '转出账户' : '账户',
              value: _accountName,
              onTap: () => _pickAccount(isDestination: false),
            ),
            if (_type == '转账') ...[
              const SizedBox(height: 8),
              _MobileSelectRow(
                icon: Icons.move_down_rounded,
                title: '转入账户',
                value: _destinationAccountName,
                onTap: () => _pickAccount(isDestination: true),
              ),
            ],
            const SizedBox(height: 8),
            _MobileSelectRow(
              icon: Icons.schedule_rounded,
              title: '日期时间',
              value: DateFormat('MM月dd日 HH:mm').format(_occurredAt),
              onTap: _pickDateTime,
            ),
            if (_type == '支出') ...[
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: '刚需', label: Text('刚需')),
                  ButtonSegment(value: '悦己', label: Text('悦己')),
                  ButtonSegment(value: '冲动', label: Text('冲动')),
                ],
                selected: {_mood},
                onSelectionChanged: (value) =>
                    setState(() => _mood = value.first),
              ),
              const SizedBox(height: 8),
              _MobileSelectRow(
                icon: Icons.group_outlined,
                title: '参与人 / 分账',
                value: _splitMemberName,
                onTap: _pickSplitMember,
              ),
              if (_splitMemberId != null) ...[
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: _splitMode,
                  decoration: const InputDecoration(labelText: '分账方式'),
                  items: const [
                    DropdownMenuItem(value: '全额由我支付', child: Text('我先垫付全部')),
                    DropdownMenuItem(value: '全额由对方支付', child: Text('对方先垫付全部')),
                    DropdownMenuItem(value: '按比例平摊', child: Text('按比例平摊')),
                  ],
                  onChanged: (value) =>
                      setState(() => _splitMode = value ?? '按比例平摊'),
                ),
                if (_splitMode == '按比例平摊') ...[
                  const SizedBox(height: 6),
                  Text(
                    '我承担 ${_mySharePercent.round()}%',
                    style: const TextStyle(color: _mobileMuted),
                  ),
                  Slider(
                    value: _mySharePercent,
                    min: 0,
                    max: 100,
                    divisions: 20,
                    label: '${_mySharePercent.round()}%',
                    onChanged: (value) =>
                        setState(() => _mySharePercent = value),
                  ),
                ],
              ],
            ],
            const SizedBox(height: 8),
            if (_type != '转账') ...[
              TextField(
                controller: _title,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  prefixIcon: Icon(
                    Icons.storefront_outlined,
                    color: _mobileMuted,
                  ),
                  labelText: '商户 / 项目',
                  hintText: '例如：午餐、地铁、工资',
                ),
              ),
              const SizedBox(height: 8),
            ],
            TextField(
              controller: _note,
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.notes_rounded, color: _mobileMuted),
                hintText: '添加备注，例如：午餐、地铁、房租…',
              ),
            ),
            if (_type != '转账') ...[
              const SizedBox(height: 8),
              TextField(
                controller: _tags,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                  prefixIcon: Icon(
                    Icons.label_outline_rounded,
                    color: _mobileMuted,
                  ),
                  labelText: '标签（可选）',
                  hintText: '多个标签用逗号分隔，例如：工作、报销',
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _discountAmount,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  prefixIcon: Icon(
                    Icons.local_offer_outlined,
                    color: _mobileMuted,
                  ),
                  labelText: '优惠金额（可选）',
                  prefixText: '¥ ',
                ),
              ),
              SwitchListTile.adaptive(
                contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                title: const Text('待报销'),
                subtitle: const Text(
                  '保留在报销清单中，不改变实际流水金额',
                  style: TextStyle(color: _mobileMuted, fontSize: 12),
                ),
                value: _reimbursable,
                activeTrackColor: _mobileBrand,
                onChanged: (value) => setState(() => _reimbursable = value),
              ),
              SwitchListTile.adaptive(
                contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                title: const Text('不计入预算'),
                subtitle: const Text(
                  '仍保留在账单中，但不参与预算统计',
                  style: TextStyle(color: _mobileMuted, fontSize: 12),
                ),
                value: _excludeFromBudget,
                activeTrackColor: _mobileBrand,
                onChanged: (value) =>
                    setState(() => _excludeFromBudget = value),
              ),
            ],
            const SizedBox(height: 8),
            SwitchListTile.adaptive(
              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
              title: const Text('连续记账'),
              subtitle: const Text(
                '保存后保留账户与日期，继续输入下一笔',
                style: TextStyle(color: _mobileMuted, fontSize: 12),
              ),
              value: _continuous,
              activeTrackColor: _mobileBrand,
              onChanged: (value) => setState(() => _continuous = value),
            ),
            const SizedBox(height: 18),
            SizedBox(
              height: 54,
              child: FilledButton(
                onPressed: _saving ? null : _save,
                style: FilledButton.styleFrom(
                  backgroundColor: _type == '支出'
                      ? _mobileExpense
                      : _type == '收入'
                      ? _mobileIncome
                      : _mobilePurple,
                  foregroundColor: _mobileBg,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: _saving
                    ? const CircularProgressIndicator(strokeWidth: 2)
                    : Text(
                        '保存$_type ${_mobileMoney(_baseAmountCents)} $_accountCurrency',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String get _accountName {
    for (final account in controller.activeAccounts) {
      if (account.id == _accountId) return '${account.icon}  ${account.name}';
    }
    return controller.activeAccounts.isEmpty
        ? '暂无账户'
        : '${controller.activeAccounts.first.icon}  ${controller.activeAccounts.first.name}';
  }

  String get _accountCurrency {
    for (final account in controller.activeAccounts) {
      if (account.id == _accountId) return account.currency;
    }
    return controller.activeAccounts.isEmpty
        ? 'CNY'
        : controller.activeAccounts.first.currency;
  }

  String get _rateText => (_exchangeRateMicros / 1000000)
      .toStringAsFixed(6)
      .replaceFirst(RegExp(r'0+$'), '')
      .replaceFirst(RegExp(r'\.$'), '');

  int _rateFor(String original, String account) {
    if (original == account) return 1000000;
    final rates = controller.exchangeRates?.rates;
    final from = rates?[original];
    final to = rates?[account];
    if (from == null || to == null || to <= 0) return 1000000;
    return (from / to * 1000000).round();
  }

  String get _destinationAccountName {
    for (final account in controller.activeAccounts) {
      if (account.id == _toAccountId) {
        return '${account.icon}  ${account.name}';
      }
    }
    return '请选择转入账户';
  }

  String get _splitMemberName {
    if (_splitMemberId == null) return '不分账';
    for (final member in controller.members) {
      if (member.id == _splitMemberId) return '${member.icon}  ${member.name}';
    }
    return '不分账';
  }

  int get _amountCents => AmountExpression.evaluateCents(_amount) ?? 0;

  int get _baseAmountCents {
    if (_type == '转账' || _originalCurrency == _accountCurrency) {
      return _amountCents;
    }
    return (_amountCents * _exchangeRateMicros / 1000000).round();
  }

  void _inputKey(String key) {
    if (_hapticsEnabled) HapticFeedback.selectionClick();
    setState(() {
      if (key == '⌫') {
        if (_amount.length <= 1) {
          _amount = '0';
        } else {
          _amount = _amount.substring(0, _amount.length - 1);
        }
      } else if (key == '清空') {
        _amount = '0';
      } else if (!AmountExpression.canAppend(_amount, key)) {
        return;
      } else if (_amount == '0' && key != '.') {
        _amount = key;
      } else {
        _amount += key;
      }
    });
  }

  Future<void> _pickAccount({required bool isDestination}) async {
    if (controller.activeAccounts.isEmpty) return;
    final id = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: _mobileSurface,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: controller.activeAccounts
              .map(
                (account) => ListTile(
                  leading: Text(
                    account.icon,
                    style: const TextStyle(fontSize: 24),
                  ),
                  title: Text(account.name),
                  subtitle: Text(
                    '${controller.preferences.hideAmounts ? '••••' : _mobileMoney(account.balanceCents)} · ${account.currency} · ${account.type}',
                    style: const TextStyle(color: _mobileMuted),
                  ),
                  trailing:
                      account.id == (isDestination ? _toAccountId : _accountId)
                      ? const Icon(Icons.check_rounded, color: _mobileBrand)
                      : null,
                  onTap: () => Navigator.pop(context, account.id),
                ),
              )
              .toList(),
        ),
      ),
    );
    if (id != null) {
      setState(() {
        if (isDestination) {
          _toAccountId = id;
        } else {
          _accountId = id;
          _accountManuallySelected = true;
          _originalCurrency = controller.activeAccounts
              .firstWhere((account) => account.id == id)
              .currency;
          _exchangeRateMicros = _rateFor(_originalCurrency, _accountCurrency);
          _exchangeRate.text = _rateText;
        }
      });
    }
  }

  Future<void> _pickDateTime() async {
    final now = DateTime.now();
    final selected = await showModalBottomSheet<DateTime>(
      context: context,
      backgroundColor: _mobileSurface,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final offset in [0, 1, 2])
              ListTile(
                leading: const Icon(Icons.calendar_today_outlined),
                title: Text(
                  offset == 0
                      ? '今天'
                      : offset == 1
                      ? '昨天'
                      : '前天',
                ),
                subtitle: Text(
                  DateFormat('yyyy年MM月dd日')
                      .format(now.subtract(Duration(days: offset))),
                ),
                onTap: () {
                  final day = now.subtract(Duration(days: offset));
                  Navigator.pop(
                    sheetContext,
                    DateTime(
                      day.year,
                      day.month,
                      day.day,
                      _occurredAt.hour,
                      _occurredAt.minute,
                    ),
                  );
                },
              ),
            ListTile(
              leading: const Icon(Icons.edit_calendar_outlined),
              title: const Text('选择其他日期'),
              onTap: () async {
                final navigator = Navigator.of(sheetContext);
                final day = await showDatePicker(
                  context: sheetContext,
                  initialDate: _occurredAt,
                  firstDate: DateTime(2000),
                  lastDate: now.add(const Duration(days: 365)),
                );
                if (day != null) {
                  navigator.pop(
                    DateTime(
                      day.year,
                      day.month,
                      day.day,
                      _occurredAt.hour,
                      _occurredAt.minute,
                    ),
                  );
                }
              },
            ),
          ],
        ),
      ),
    );
    if (selected == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_occurredAt),
    );
    if (!mounted) return;
    setState(() {
      _occurredAt = DateTime(
        selected.year,
        selected.month,
        selected.day,
        time?.hour ?? selected.hour,
        time?.minute ?? selected.minute,
      );
    });
  }

  Future<void> _loadEntryPreferences() async {
    final recent = await _entryPreferences.recentCategories();
    if (mounted) {
      setState(() {
        _recentCategories = recent;
        _hapticsEnabled = controller.preferences.hapticsEnabled;
        _continuous = controller.preferences.continuousEntry;
      });
      await _restoreEntryDraftIfPresent();
    }
  }

  Future<void> _restoreEntryDraftIfPresent() async {
    final draft = await _entryPreferences.entryDraft();
    if (!mounted || draft == null) return;
    final restore = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('恢复未完成记账'),
        content: const Text('上次保存失败，是否恢复刚才填写的内容？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('放弃'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('恢复'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (restore == true) {
      _applyEntryDraft(draft);
    } else {
      await _entryPreferences.clearEntryDraft();
    }
  }

  Future<void> _pickOriginalCurrency() async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: _supportedMobileCurrencies
              .map(
                (currency) => ListTile(
                  leading: const Icon(Icons.currency_exchange_rounded),
                  title: Text(currency),
                  trailing: currency == _originalCurrency
                      ? const Icon(Icons.check_rounded, color: _mobileBrand)
                      : null,
                  onTap: () => Navigator.pop(context, currency),
                ),
              )
              .toList(),
        ),
      ),
    );
    if (selected == null || !mounted) return;
    setState(() {
      _originalCurrency = selected;
      _exchangeRateMicros = _rateFor(selected, _accountCurrency);
      _exchangeRate.text = _rateText;
    });
  }

  void _applyEntryDraft(Map<String, dynamic> draft) {
    final draftType = _draftString(draft['type']);
    final draftOccurredAt = DateTime.tryParse(
      _draftString(draft['occurredAt']) ?? '',
    );
    final accountId = _draftInt(draft['accountId']);
    final toAccountId = _draftInt(draft['toAccountId']);
    final splitMemberId = _draftInt(draft['splitMemberId']);
    final draftCategory = _draftString(draft['category']);
    setState(() {
      if (draftType != null && const ['支出', '收入', '转账'].contains(draftType)) {
        _type = draftType;
      }
      _amount = _draftString(draft['amount']) ?? '0';
      _title.text = _draftString(draft['title']) ?? '';
      _note.text = _draftString(draft['note']) ?? '';
      _tags.text = _draftString(draft['tags']) ?? '';
      _discountAmount.text = _draftString(draft['discountAmount']) ?? '';
      final originalCurrency = _draftString(draft['originalCurrency']);
      if (originalCurrency != null &&
          _supportedMobileCurrencies.contains(originalCurrency)) {
        _originalCurrency = originalCurrency;
      }
      _exchangeRateMicros =
          (draft['exchangeRateMicros'] as num?)?.toInt() ??
          _rateFor(_originalCurrency, _accountCurrency);
      _exchangeRate.text = _rateText;
      _mood = _draftString(draft['mood']) ?? '刚需';
      _splitMode = _draftString(draft['splitMode']) ?? '按比例平摊';
      _mySharePercent = (draft['mySharePercent'] as num?)?.toDouble() ?? 50;
      _reimbursable = draft['reimbursable'] == true;
      _excludeFromBudget = draft['excludeFromBudget'] == true;
      if (draftOccurredAt != null) _occurredAt = draftOccurredAt.toLocal();
      if (draftCategory != null &&
          _choices.any((choice) => choice.name == draftCategory)) {
        _category = draftCategory;
      } else {
        _category = _choices.isEmpty ? null : _choices.first.name;
      }
      if (accountId != null &&
          controller.activeAccounts.any((account) => account.id == accountId)) {
        _accountId = accountId;
      }
      if (toAccountId != null &&
          controller.activeAccounts.any(
            (account) => account.id == toAccountId,
          )) {
        _toAccountId = toAccountId;
      }
      if (splitMemberId != null &&
          controller.members.any((member) => member.id == splitMemberId)) {
        _splitMemberId = splitMemberId;
      }
    });
  }

  String? _draftString(Object? value) => value is String ? value : null;

  int? _draftInt(Object? value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse('$value');
  }

  Map<String, dynamic> _entryDraft() => {
    'type': _type,
    'amount': _amount,
    'title': _title.text,
    'note': _note.text,
    'tags': _tags.text,
    'discountAmount': _discountAmount.text,
    'originalCurrency': _originalCurrency,
    'exchangeRateMicros': _exchangeRateMicros,
    'accountId': _accountId,
    'toAccountId': _toAccountId,
    'category': _category,
    'mood': _mood,
    'splitMemberId': _splitMemberId,
    'splitMode': _splitMode,
    'mySharePercent': _mySharePercent,
    'occurredAt': _occurredAt.toIso8601String(),
    'reimbursable': _reimbursable,
    'excludeFromBudget': _excludeFromBudget,
  };

  Future<void> _selectCategory(String category) async {
    setState(() => _category = category);
    if (_accountManuallySelected) return;
    final accountId = await _entryPreferences.accountForCategory(category);
    if (!mounted || accountId == null) return;
    if (controller.activeAccounts.any((account) => account.id == accountId)) {
      setState(() => _accountId = accountId);
    }
  }

  Future<void> _pickSplitMember() async {
    final partners = controller.members
        .where((member) => !member.isMe)
        .toList();
    final selected = await showModalBottomSheet<int?>(
      context: context,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.person_off_outlined),
              title: const Text('不分账'),
              onTap: () => Navigator.pop(context, -1),
            ),
            for (final member in partners)
              ListTile(
                leading: Text(
                  member.icon,
                  style: const TextStyle(fontSize: 22),
                ),
                title: Text(member.name),
                trailing: member.id == _splitMemberId
                    ? const Icon(Icons.check_rounded, color: _mobileBrand)
                    : null,
                onTap: () => Navigator.pop(context, member.id),
              ),
            if (partners.isEmpty)
              const Padding(
                padding: EdgeInsets.all(20),
                child: Text(
                  '请先在分账管理中添加参与人',
                  style: TextStyle(color: _mobileMuted),
                ),
              ),
          ],
        ),
      ),
    );
    if (selected != null && mounted) {
      setState(() => _splitMemberId = selected == -1 ? null : selected);
    }
  }

  Future<void> _save() async {
    final cents = AmountExpression.evaluateCents(_amount);
    final amount = cents == null ? 0.0 : cents / 100;
    if (amount <= 0 ||
        (_type != '转账' && _category == null) ||
        (_type != '转账' && _baseAmountCents <= 0)) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请输入金额并选择分类')));
      return;
    }
    setState(() => _saving = true);
    try {
      if (_type == '转账') {
        if (_accountId == null || _toAccountId == null) {
          throw const ApiException('请选择转出和转入账户');
        }
        await controller.transfer(
          kind: '账户转账',
          fromAccountId: _accountId!,
          toAccountId: _toAccountId!,
          amount: amount,
          note: _note.text.trim().isEmpty ? null : _note.text.trim(),
          occurredAt: _occurredAt,
        );
      } else {
        final parsedTags = _tags.text
            .split(RegExp(r'[,，]'))
            .map((tag) => tag.trim())
            .where((tag) => tag.isNotEmpty)
            .toSet()
            .take(12)
            .toList();
        final parsedDiscount =
            double.tryParse(_discountAmount.text.trim()) ?? 0;
        if (parsedDiscount < 0 || !parsedDiscount.isFinite) {
          throw const ApiException('优惠金额格式无效');
        }
        await controller.addEntry(
          amount: _baseAmountCents / 100,
          title: _title.text.trim().isEmpty ? _category! : _title.text.trim(),
          category: _category!,
          type: _type,
          accountId: _accountId,
          occurredAt: _occurredAt.toUtc().toIso8601String(),
          mood: _type == '支出' ? _mood : null,
          note: _note.text.trim().isEmpty ? null : _note.text.trim(),
          tags: parsedTags,
          reimbursable: _reimbursable,
          discountAmountCents: (parsedDiscount * 100).round(),
          excludeFromBudget: _excludeFromBudget,
          originalAmountCents: _amountCents,
          originalCurrency: _originalCurrency,
          exchangeRateMicros: _exchangeRateMicros,
          splitWithMemberId: _type == '支出' ? _splitMemberId : null,
          splitMode: _type == '支出' && _splitMemberId != null
              ? _splitMode
              : null,
          mySharePercent: _splitMode == '按比例平摊' ? _mySharePercent : 100,
        );
      }
      if (!mounted) return;
      try {
        await _entryPreferences.clearEntryDraft();
      } catch (_) {
        // Local draft cleanup must not turn a successful save into an error.
      }
      if (_type != '转账' && _accountId != null && _category != null) {
        try {
          await _entryPreferences.remember(
            category: _category!,
            accountId: _accountId!,
          );
        } catch (_) {
          // 本地偏好失败不能把已经成功写入的账单误报为失败。
        }
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('已保存，账本已同步')));
      if (_continuous && _type != '转账') {
        setState(() {
          _amount = '0';
          _title.clear();
          _note.clear();
          _tags.clear();
          _discountAmount.clear();
          _reimbursable = false;
          _excludeFromBudget = false;
        });
      } else {
        Navigator.pop(context);
      }
    } catch (error) {
      try {
        await _entryPreferences.saveEntryDraft(_entryDraft());
      } catch (_) {
        // A draft is best effort; retain the original save error for the user.
      }
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$error；已保留本次填写内容')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _MobilePage extends StatelessWidget {
  const _MobilePage({
    required this.controller,
    required this.title,
    required this.child,
    this.trailing,
  });

  final LedgerController controller;
  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _mobileBg,
      appBar: AppBar(
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          if (controller.loading)
            const Padding(
              padding: EdgeInsets.only(right: 12),
              child: Center(
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
          if (trailing != null)
            Padding(
              padding: const EdgeInsets.only(right: 14),
              child: trailing!,
            ),
        ],
      ),
      body: child,
    );
  }
}

class _MonthlyCard extends StatelessWidget {
  const _MonthlyCard({required this.page, required this.hideAmounts});

  final TransactionPage page;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        gradient: const LinearGradient(
          colors: [Color(0xff2f293e), Color(0xff4d3e61)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: const Color(0x33ffffff)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                '本月结余',
                style: TextStyle(color: _mobileMuted, fontSize: 14),
              ),
              Text(
                DateFormat('yyyy.MM').format(DateTime.now()),
                style: const TextStyle(color: _mobileMuted, fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            hideAmounts ? '••••' : _mobileMoney(page.balanceCents),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 34,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: _SummaryValue(
                  label: '收入',
                  amount: page.incomeCents,
                  color: _mobileIncome,
                  hideAmount: hideAmounts,
                ),
              ),
              Expanded(
                child: _SummaryValue(
                  label: '支出',
                  amount: page.expenseCents,
                  color: _mobileExpense,
                  hideAmount: hideAmounts,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BillSummary extends StatelessWidget {
  const _BillSummary({required this.page, required this.hideAmounts});

  final TransactionPage page;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _MetricCard(
            label: '收入',
            value: hideAmounts ? '••••' : _mobileMoney(page.incomeCents),
            color: _mobileIncome,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _MetricCard(
            label: '支出',
            value: hideAmounts ? '••••' : _mobileMoney(page.expenseCents),
            color: _mobileExpense,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _MetricCard(
            label: '笔数',
            value: '${page.total}',
            color: _mobilePurple,
          ),
        ),
      ],
    );
  }
}

class _DaySummaryHeader extends StatelessWidget {
  const _DaySummaryHeader({
    required this.day,
    required this.items,
    required this.hideAmounts,
  });

  final DateTime day;
  final List<TransactionItem> items;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    final income = items
        .where((item) => item.isIncome)
        .fold<int>(0, (sum, item) => sum + item.amountCents);
    final expense = items
        .where((item) => !item.isIncome)
        .fold<int>(0, (sum, item) => sum + item.amountCents);
    return Row(
      children: [
        Text(
          '${DateFormat('MM月dd日').format(day)} ${const ['一', '二', '三', '四', '五', '六', '日'][day.weekday - 1]}',
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
        const Spacer(),
        Text(
          hideAmounts
              ? '金额已隐藏'
              : '收 ${_mobileMoney(income)}  支 ${_mobileMoney(expense)}  结 ${_mobileMoney(income - expense)}',
          style: const TextStyle(color: _mobileMuted, fontSize: 12),
        ),
      ],
    );
  }
}

class _MobileSelectionToolbar extends StatelessWidget {
  const _MobileSelectionToolbar({
    required this.count,
    required this.onCancel,
    required this.onApply,
  });

  final int count;
  final VoidCallback onCancel;
  final VoidCallback onApply;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    decoration: BoxDecoration(
      color: _mobileBrand.withValues(alpha: .12),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: _mobileBrand.withValues(alpha: .45)),
    ),
    child: Row(
      children: [
        Text(
          '已选 $count 笔',
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        const Spacer(),
        TextButton(onPressed: onCancel, child: const Text('取消')),
        FilledButton.icon(
          onPressed: count == 0 ? null : onApply,
          icon: const Icon(Icons.tune_rounded, size: 18),
          label: const Text('批量操作'),
        ),
      ],
    ),
  );
}

class _TransactionTile extends StatelessWidget {
  const _TransactionTile({
    required this.item,
    this.dense = false,
    this.onTap,
    this.onLongPress,
    this.hideAmount = false,
    this.selected = false,
  });

  final TransactionItem item;
  final bool dense;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final bool hideAmount;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final icon = item.category == '餐饮'
        ? '🍜'
        : item.isIncome
        ? '💼'
        : '🧾';
    final color = item.isIncome ? _mobileIncome : _mobileExpense;
    return InkWell(
      onTap: onTap,
      onLongPress: onLongPress,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: 14,
          vertical: dense ? 12 : 14,
        ),
        decoration: BoxDecoration(
          color: _mobileSurface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: selected ? _mobileBrand : _mobileLine),
        ),
        child: Row(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 42,
                  height: 42,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: color.withAlpha(24),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text(icon, style: const TextStyle(fontSize: 21)),
                ),
                if (selected)
                  const Positioned(
                    right: -6,
                    top: -6,
                    child: Icon(
                      Icons.check_circle,
                      color: _mobileBrand,
                      size: 19,
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${item.category ?? '未分类'} · ${_mobileDate(item.occurredAt)}',
                    style: const TextStyle(color: _mobileMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              hideAmount
                  ? '••••'
                  : '${item.isIncome ? '+' : '-'}${_mobileMoneyCurrency(item.amountCents, item.currency)}',
              style: TextStyle(color: color, fontWeight: FontWeight.w800),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryChart extends StatelessWidget {
  const _CategoryChart({
    required this.buckets,
    required this.maxAmount,
    required this.hideAmounts,
  });

  final List<AnalysisBucket> buckets;
  final int maxAmount;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _mobileBoxDecoration(),
      child: Column(
        children: buckets.take(6).map((bucket) {
          final ratio = bucket.amountCents / maxAmount;
          return Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Row(
              children: [
                SizedBox(
                  width: 62,
                  child: Text(
                    bucket.name,
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: LinearProgressIndicator(
                      minHeight: 9,
                      value: ratio.clamp(0, 1),
                      backgroundColor: const Color(0x18ffffff),
                      valueColor: const AlwaysStoppedAnimation(_mobilePurple),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  hideAmounts ? '••••' : _mobileMoney(bucket.amountCents),
                  style: const TextStyle(color: _mobileMuted, fontSize: 12),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _TrendChart extends StatelessWidget {
  const _TrendChart({required this.points});

  final List<AnalysisTrendPoint> points;

  @override
  Widget build(BuildContext context) {
    final visible = points.length > 12
        ? points.sublist(points.length - 12)
        : points;
    final maxValue = visible.fold<int>(1, (max, item) {
      final value = item.expenseCents > item.incomeCents
          ? item.expenseCents
          : item.incomeCents;
      return value > max ? value : max;
    });
    return Container(
      height: 190,
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 12),
      decoration: _mobileBoxDecoration(),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: visible.map((item) {
          final expense = item.expenseCents / maxValue;
          final income = item.incomeCents / maxValue;
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Expanded(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _ChartBar(value: expense, color: _mobileExpense),
                        const SizedBox(width: 2),
                        _ChartBar(value: income, color: _mobileIncome),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    item.label,
                    maxLines: 1,
                    overflow: TextOverflow.clip,
                    style: const TextStyle(color: _mobileMuted, fontSize: 9),
                  ),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _ChartBar extends StatelessWidget {
  const _ChartBar({required this.value, required this.color});

  final double value;
  final Color color;

  @override
  Widget build(BuildContext context) => Flexible(
    child: FractionallySizedBox(
      heightFactor: value.clamp(.02, 1),
      child: Container(
        width: 8,
        decoration: BoxDecoration(
          color: color,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(5)),
        ),
      ),
    ),
  );
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.user, required this.onAvatarTap});

  final SessionUser? user;
  final VoidCallback onAvatarTap;

  @override
  Widget build(BuildContext context) {
    final name = user?.displayName ?? 'Neo Ledger 用户';
    return Row(
      children: [
        InkWell(
          onTap: onAvatarTap,
          customBorder: const CircleBorder(),
          child: _MobileAvatar(user: user, radius: 28),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                user?.username ?? '本地演示账号',
                style: const TextStyle(color: _mobileMuted, fontSize: 13),
              ),
            ],
          ),
        ),
        const Icon(Icons.chevron_right_rounded, color: _mobileMuted),
      ],
    );
  }
}

class _MobileAvatar extends StatelessWidget {
  const _MobileAvatar({required this.user, required this.radius});

  final SessionUser? user;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final avatar = user?.avatarUrl;
    ImageProvider<Object>? image;
    if (avatar != null && avatar.startsWith('data:image/')) {
      final comma = avatar.indexOf(',');
      if (comma >= 0) {
        try {
          image = MemoryImage(base64Decode(avatar.substring(comma + 1)));
        } catch (_) {}
      }
    }
    return CircleAvatar(
      radius: radius,
      backgroundColor: _mobileBrand.withAlpha(40),
      backgroundImage: image,
      child: image == null
          ? Text(
              (user?.displayName.isNotEmpty == true)
                  ? user!.displayName.substring(0, 1)
                  : '?',
              style: TextStyle(
                color: _mobileBrand,
                fontSize: radius * .78,
                fontWeight: FontWeight.w800,
              ),
            )
          : null,
    );
  }
}

class _NetWorthCard extends StatelessWidget {
  const _NetWorthCard({
    required this.assetTotal,
    required this.liabilityTotal,
    required this.ledgerName,
    required this.hideAmounts,
  });

  final int assetTotal;
  final int liabilityTotal;
  final String ledgerName;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: _mobileBoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xff24322b), Color(0xff20242e)],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            ledgerName,
            style: const TextStyle(color: _mobileMuted, fontSize: 13),
          ),
          const SizedBox(height: 6),
          Text(
            hideAmounts ? '••••' : _mobileMoney(assetTotal - liabilityTotal),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 28,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _SummaryValue(
                  label: '总资产',
                  amount: assetTotal,
                  color: _mobileBrand,
                  hideAmount: hideAmounts,
                ),
              ),
              Expanded(
                child: _SummaryValue(
                  label: '总负债',
                  amount: liabilityTotal,
                  color: _mobileExpense,
                  hideAmount: hideAmounts,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SettingsRow extends StatelessWidget {
  const _SettingsRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
  });

  final String icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        decoration: _mobileBoxDecoration(),
        child: Row(
          children: [
            SizedBox(
              width: 34,
              child: Text(icon, style: const TextStyle(fontSize: 22)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    style: const TextStyle(color: _mobileMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            if (onTap != null)
              const Icon(Icons.chevron_right_rounded, color: _mobileMuted),
          ],
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(18),
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: _mobileBoxDecoration(),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 7),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    ),
  );
}

class _SummaryValue extends StatelessWidget {
  const _SummaryValue({
    required this.label,
    required this.amount,
    required this.color,
    this.hideAmount = false,
  });

  final String label;
  final int amount;
  final Color color;
  final bool hideAmount;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: const TextStyle(color: _mobileMuted, fontSize: 12)),
      const SizedBox(height: 4),
      Text(
        hideAmount ? '••••' : _mobileMoney(amount),
        style: TextStyle(color: color, fontWeight: FontWeight.w800),
      ),
    ],
  );
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: _mobileBoxDecoration(),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: _mobileMuted, fontSize: 12)),
        const SizedBox(height: 7),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: color,
            fontSize: 16,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  );
}

class _InsightCard extends StatelessWidget {
  const _InsightCard({
    required this.title,
    required this.value,
    required this.caption,
    required this.icon,
  });

  final String title;
  final String value;
  final String caption;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: _mobileBoxDecoration(
      gradient: const LinearGradient(
        colors: [Color(0xff293746), Color(0xff2c2741)],
      ),
    ),
    child: Row(
      children: [
        Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: _mobileBrand.withAlpha(30),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: _mobileBrand),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(color: _mobileMuted, fontSize: 13),
              ),
              const SizedBox(height: 5),
              Text(
                value,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 25,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                caption,
                style: const TextStyle(color: _mobileMuted, fontSize: 12),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.action});

  final String title;
  final String? action;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(
        title,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 17,
          fontWeight: FontWeight.w800,
        ),
      ),
      if (action != null)
        Text(
          action!,
          style: const TextStyle(color: _mobileMuted, fontSize: 12),
        ),
    ],
  );
}

class _MobileBrandMark extends StatelessWidget {
  const _MobileBrandMark();

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(
        width: 44,
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: _mobileBrand,
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Text(
          '¥',
          style: TextStyle(
            color: _mobileBg,
            fontSize: 27,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      const SizedBox(width: 12),
      const Text(
        'NEO LEDGER',
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w800,
          letterSpacing: 3,
        ),
      ),
    ],
  );
}

class _MobileTextField extends StatelessWidget {
  const _MobileTextField({
    required this.controller,
    required this.label,
    required this.icon,
    this.obscureText = false,
    this.suffix,
    this.textInputAction,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final IconData icon;
  final bool obscureText;
  final Widget? suffix;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) => TextField(
    controller: controller,
    obscureText: obscureText,
    textInputAction: textInputAction,
    onSubmitted: onSubmitted,
    style: const TextStyle(color: Colors.white),
    decoration: InputDecoration(
      labelText: label,
      prefixIcon: Icon(icon, color: _mobileMuted),
      suffixIcon: suffix,
    ),
  );
}

class _TypeSwitch extends StatelessWidget {
  const _TypeSwitch({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: _mobileSurface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: ['支出', '收入', '转账']
            .map(
              (item) => Expanded(
                child: GestureDetector(
                  onTap: () => onChanged(item),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      color: value == item
                          ? (item == '支出'
                                ? _mobileExpense
                                : item == '收入'
                                ? _mobileIncome
                                : _mobilePurple)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      item,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: value == item ? _mobileBg : _mobileMuted,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _AmountDisplay extends StatelessWidget {
  const _AmountDisplay({
    required this.amount,
    required this.type,
    required this.currency,
  });

  final String amount;
  final String type;
  final String currency;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Text(type, style: const TextStyle(color: _mobileMuted, fontSize: 13)),
      const SizedBox(height: 4),
      AnimatedSwitcher(
        duration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : MobileMotion.fast,
        transitionBuilder: (child, animation) => FadeTransition(
          opacity: animation,
          child: ScaleTransition(
            scale: Tween(begin: .96, end: 1.0).animate(animation),
            child: child,
          ),
        ),
        child: Text(
          '$currency $amount',
          key: ValueKey(amount),
          style: TextStyle(
            color: type == '支出'
                ? _mobileExpense
                : type == '收入'
                ? _mobileIncome
                : _mobilePurple,
            fontSize: 42,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    ],
  );
}

class _Keypad extends StatelessWidget {
  const _Keypad({required this.onKey});

  final ValueChanged<String> onKey;

  @override
  Widget build(BuildContext context) {
    const keys = [
      '1',
      '2',
      '3',
      '+',
      '4',
      '5',
      '6',
      '-',
      '7',
      '8',
      '9',
      '⌫',
      '清空',
      '0',
      '.',
    ];
    return GridView.count(
      crossAxisCount: 4,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: 2.05,
      children: keys
          .map(
            (key) => InkWell(
              onTap: () => onKey(key),
              borderRadius: BorderRadius.circular(14),
              child: Container(
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: _mobileSurface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: _mobileLine),
                ),
                child: Text(
                  key,
                  style: TextStyle(
                    color: key == '⌫' ? _mobileMuted : Colors.white,
                    fontSize: 21,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          )
          .toList(),
    );
  }
}

class _FormLabel extends StatelessWidget {
  const _FormLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Text(
    label,
    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
  );
}

class _MobileCategoryChoice {
  const _MobileCategoryChoice({
    required this.name,
    required this.icon,
    required this.color,
    this.parentName,
  });

  final String name;
  final String icon;
  final Color color;
  final String? parentName;
}

class _CategoryChoice extends StatelessWidget {
  const _CategoryChoice({
    required this.choice,
    required this.selected,
    required this.onTap,
  });

  final _MobileCategoryChoice choice;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(16),
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: selected ? choice.color.withAlpha(38) : _mobileSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: selected ? choice.color : _mobileLine,
          width: selected ? 1.5 : 1,
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (choice.parentName != null)
            Text(
              choice.parentName!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: _mobileMuted, fontSize: 8),
            ),
          Text(choice.icon, style: const TextStyle(fontSize: 20)),
          const SizedBox(height: 4),
          Text(
            choice.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: selected ? Colors.white : _mobileMuted,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    ),
  );
}

class _MobileSelectRow extends StatelessWidget {
  const _MobileSelectRow({
    required this.icon,
    required this.title,
    required this.value,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(14),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
      decoration: _mobileBoxDecoration(),
      child: Row(
        children: [
          Icon(icon, color: _mobileMuted),
          const SizedBox(width: 12),
          Text(title, style: const TextStyle(color: _mobileMuted)),
          const Spacer(),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(width: 4),
          const Icon(Icons.chevron_right_rounded, color: _mobileMuted),
        ],
      ),
    ),
  );
}

class _SyncButton extends StatelessWidget {
  const _SyncButton({required this.controller});

  final LedgerController controller;

  @override
  Widget build(BuildContext context) => IconButton(
    onPressed: controller.loading ? null : controller.refresh,
    icon: const Icon(Icons.sync_rounded, color: _mobileMuted),
  );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(28),
    decoration: _mobileBoxDecoration(),
    child: Column(
      children: [
        Icon(icon, size: 38, color: _mobileMuted),
        const SizedBox(height: 12),
        Text(
          title,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: _mobileMuted,
            fontSize: 12,
            height: 1.5,
          ),
        ),
      ],
    ),
  );
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: const Color(0x22ff8a7a),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      children: [
        Expanded(
          child: Text(
            message,
            style: const TextStyle(
              color: _mobileExpense,
              fontSize: 12,
              height: 1.4,
            ),
          ),
        ),
        if (onRetry != null)
          TextButton(onPressed: onRetry, child: const Text('重试')),
      ],
    ),
  );
}

class _MobileLoadingView extends StatelessWidget {
  const _MobileLoadingView();

  @override
  Widget build(BuildContext context) => const Scaffold(
    backgroundColor: _mobileBg,
    body: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(color: _mobileBrand),
          SizedBox(height: 18),
          Text('正在同步你的 Neo Ledger…', style: TextStyle(color: _mobileMuted)),
        ],
      ),
    ),
  );
}

BoxDecoration _mobileBoxDecoration({Gradient? gradient}) => BoxDecoration(
  color: gradient == null ? _mobileSurface : null,
  gradient: gradient,
  borderRadius: BorderRadius.circular(18),
  border: Border.all(color: _mobileLine),
);

String _mobileMoney(int cents) => NumberFormat.currency(
  locale: 'zh_CN',
  symbol: '¥',
  decimalDigits: 2,
).format(cents / 100);

String _mobileMoneyCurrency(int cents, String currency) =>
    NumberFormat.currency(
      locale: 'zh_CN',
      name: currency,
      symbol: currency,
      decimalDigits: currency == 'JPY' ? 0 : 2,
    ).format(cents / 100);

String _mobileDate(String value) {
  final parsed = DateTime.tryParse(value);
  return parsed == null
      ? value
      : DateFormat('MM-dd HH:mm').format(parsed.toLocal());
}

String _greeting() {
  final hour = DateTime.now().hour;
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

Color _mobileHex(String value) {
  final normalized = value.replaceFirst('#', '').trim();
  final hex = normalized.length == 6 ? 'FF$normalized' : normalized;
  final parsed = int.tryParse(hex, radix: 16);
  return parsed == null ? _mobilePurple : Color(parsed);
}

List<AnalysisBucket> _fallbackBuckets(List<TransactionItem> items) {
  final totals = <String, int>{};
  for (final item in items.where((item) => !item.isIncome)) {
    final name = item.category?.trim().isNotEmpty == true
        ? item.category!
        : '未分类';
    totals[name] = (totals[name] ?? 0) + item.amountCents;
  }
  return totals.entries
      .map((entry) => AnalysisBucket(name: entry.key, amountCents: entry.value))
      .toList()
    ..sort((a, b) => b.amountCents.compareTo(a.amountCents));
}
