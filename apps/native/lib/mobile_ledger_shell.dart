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

class _MobileLedgerShellState extends State<MobileLedgerShell> {
  int _tab = 0;

  LedgerController get controller => widget.controller;

  @override
  Widget build(BuildContext context) {
    if (!controller.authenticated) {
      if (controller.loading || controller.api.hasSession) {
        return const _MobileLoadingView();
      }
      return MobileLoginPage(controller: controller);
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

class MobileHomePage extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final page = controller.transactions;
    final displayName = controller.user?.displayName ?? '朋友';
    return _MobilePage(
      controller: controller,
      title: '首页',
      trailing: _SyncButton(controller: controller),
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
            _MonthlyCard(page: page),
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
                    onTap: onAdd,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _QuickAction(
                    icon: Icons.swap_horiz_rounded,
                    label: '转账',
                    color: _mobilePurple,
                    onTap: onTransfer,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _QuickAction(
                    icon: Icons.flag_outlined,
                    label: '预算',
                    color: const Color(0xffffc76b),
                    onTap: () => _showComingSoon(context, '预算管理'),
                  ),
                ),
              ],
            ),
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
                      child: _TransactionTile(item: item),
                    ),
                  ),
          ],
        ),
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
  late DateTime _month;
  TransactionPage? _page;
  bool _loading = false;
  String? _error;
  int? _accountFilter;
  String? _typeFilter;
  String? _categoryFilter;
  double? _minAmount;
  double? _maxAmount;

  LedgerController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month);
    _page = controller.transactions;
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
        onPressed: _goToCurrentMonth,
        icon: const Icon(Icons.today_rounded, color: _mobileMuted),
      ),
      child: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 110),
          children: [
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
                        DateFormat('yyyy年MM月').format(_month),
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
              onSubmitted: (_) => _load(),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search_rounded),
                hintText: '搜索标题、分类、账户、金额…',
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
            const SizedBox(height: 14),
            if (_loading) const LinearProgressIndicator(minHeight: 2),
            if (_error != null) ...[
              _InlineError(message: _error!, onRetry: _load),
              const SizedBox(height: 12),
            ],
            _BillSummary(page: page),
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
                _DaySummaryHeader(day: entry.key, items: entry.value),
                const SizedBox(height: 8),
                for (final item in entry.value)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _TransactionTile(
                      item: item,
                      dense: true,
                      onTap: () => _openDetail(item),
                    ),
                  ),
                const SizedBox(height: 8),
              ],
          ],
        ),
      ),
    );
  }

  Future<void> _load() async {
    final ledger = controller.selectedLedger;
    if (ledger == null) return;
    final from = DateFormat('yyyy-MM-dd').format(_month);
    final last = DateTime(_month.year, _month.month + 1, 0);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await controller.api.fetchTransactions(
        ledger.id,
        limit: 100,
        query: _search.text,
        from: from,
        to: DateFormat('yyyy-MM-dd').format(last),
        timezoneOffsetMinutes: DateTime.now().timeZoneOffset.inMinutes,
        accountId: _accountFilter,
        type: _typeFilter,
        category: _categoryFilter,
        minAmount: _minAmount,
        maxAmount: _maxAmount,
      );
      if (mounted) setState(() => _page = page);
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _changeMonth(int delta) {
    setState(() => _month = DateTime(_month.year, _month.month + delta));
    _load();
  }

  void _goToCurrentMonth() {
    final now = DateTime.now();
    setState(() => _month = DateTime(now.year, now.month));
    _load();
  }

  bool get _hasFilters =>
      _accountFilter != null ||
      _typeFilter != null ||
      _categoryFilter != null ||
      _minAmount != null ||
      _maxAmount != null;

  void _clearFilters() {
    setState(() {
      _accountFilter = null;
      _typeFilter = null;
      _categoryFilter = null;
      _minAmount = null;
      _maxAmount = null;
    });
    _load();
  }

  Future<void> _openFilters() async {
    var accountId = _accountFilter;
    var type = _typeFilter;
    var category = _categoryFilter;
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
      } else {
        setState(() {
          _accountFilter = accountId;
          _typeFilter = type;
          _categoryFilter = category;
          _minAmount = min;
          _maxAmount = max;
        });
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
    setState(() => _month = DateTime(selected.year, selected.month));
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
                  '${item.isIncome ? '+' : '-'}${_mobileMoney(item.amountCents)}',
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
          if (item.mood != null) _DetailRow(label: '消费性质', value: item.mood!),
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
    return _MobilePage(
      controller: controller,
      title: '分析',
      trailing: const Icon(Icons.tune_rounded, color: _mobileMuted),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 110),
        children: [
          _InsightCard(
            title: '本月结余',
            value: _mobileMoney(page.balanceCents),
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
                  value: _mobileMoney(page.incomeCents),
                  color: _mobileIncome,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MetricCard(
                  label: '支出',
                  value: _mobileMoney(page.expenseCents),
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
            _CategoryChart(buckets: buckets, maxAmount: maxAmount),
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
    final accountTotal = controller.accounts.fold<int>(
      0,
      (sum, item) => sum + item.balanceCents,
    );
    final assetTotal = controller.assets.fold<int>(
      0,
      (sum, item) => sum + (item.currentValueCents ?? item.valueCents),
    );
    return _MobilePage(
      controller: controller,
      title: '我的',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 110),
        children: [
          _ProfileHeader(user: user),
          const SizedBox(height: 16),
          _NetWorthCard(
            accountTotal: accountTotal,
            assetTotal: assetTotal,
            ledgerName: controller.selectedLedger?.name ?? '日常账本',
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
            subtitle: '桌面端和网页端继续提供完整管理能力',
            onTap: () => _showComingSoon(context, '高级功能入口'),
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
              builder: (_) => const _MobileExperienceSettings(),
            ),
          ),
          _SettingsRow(
            icon: '🔒',
            title: '隐私与安全',
            subtitle: controller.preferences.lockEnabled
                ? '已开启应用锁'
                : '数据仅通过加密连接同步',
            onTap: () => _showComingSoon(context, '隐私与安全'),
          ),
          const SizedBox(height: 18),
          OutlinedButton.icon(
            onPressed: controller.loading ? null : controller.logout,
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
    final assets = controller.accounts.where((item) => item.type == '资产');
    final liabilities = controller.accounts.where((item) => item.type == '负债');
    return Scaffold(
      backgroundColor: _mobileBg,
      appBar: AppBar(title: const Text('账户与资产')),
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
            _AccountGroup(
              title: '资产账户',
              accounts: assets.toList(),
              onEdit: _editAccount,
              onDelete: _deleteAccount,
            ),
            const SizedBox(height: 18),
            _AccountGroup(
              title: '负债账户',
              accounts: liabilities.toList(),
              onEdit: _editAccount,
              onDelete: _deleteAccount,
            ),
            if (controller.assets.isNotEmpty) ...[
              const SizedBox(height: 18),
              _SectionHeader(
                title: '数字资产',
                action: '${controller.assets.length} 项',
              ),
              const SizedBox(height: 8),
              for (final asset in controller.assets)
                _SettingsRow(
                  icon: asset.assetType == '房产'
                      ? '🏠'
                      : asset.assetType == '车辆'
                      ? '🚗'
                      : asset.assetType == '贵金属'
                      ? '💎'
                      : '📦',
                  title: asset.name,
                  subtitle:
                      '${asset.assetType} · ${_mobileMoney(asset.currentValueCents ?? asset.valueCents)}',
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
}

class _AccountGroup extends StatelessWidget {
  const _AccountGroup({
    required this.title,
    required this.accounts,
    required this.onEdit,
    required this.onDelete,
  });

  final String title;
  final List<Account> accounts;
  final Future<void> Function([Account?]) onEdit;
  final Future<void> Function(Account) onDelete;

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
          for (final account in accounts)
            Dismissible(
              key: ValueKey(account.id),
              direction: DismissDirection.endToStart,
              confirmDismiss: (_) async {
                await onDelete(account);
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
              child: _SettingsRow(
                icon: account.icon,
                title: account.name,
                subtitle:
                    '${account.type} · ${account.currency} · ${_mobileMoney(account.balanceCents)}',
                onTap: () => onEdit(account),
              ),
            ),
      ],
    );
  }
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

class _MobileExperienceSettings extends StatefulWidget {
  const _MobileExperienceSettings();

  @override
  State<_MobileExperienceSettings> createState() =>
      _MobileExperienceSettingsState();
}

class _MobileExperienceSettingsState extends State<_MobileExperienceSettings> {
  final _preferences = const MobileEntryPreferences();
  bool _haptics = true;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final enabled = await _preferences.hapticsEnabled();
    if (mounted) {
      setState(() {
        _haptics = enabled;
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
                    await _preferences.setHapticsEnabled(value);
                    if (value) HapticFeedback.selectionClick();
                  },
          ),
          const Text(
            '连续记账可在每次记账时单独开启；金额动画会自动遵循系统“减少动态效果”设置。',
            style: TextStyle(color: _mobileMuted, height: 1.5),
          ),
        ],
      ),
    ),
  );
}

class _MobileAddTransactionPageState extends State<MobileAddTransactionPage> {
  final _note = TextEditingController();
  final _categorySearch = TextEditingController();
  final _entryPreferences = const MobileEntryPreferences();
  late String _type;
  String _amount = '0';
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
  List<String> _recentCategories = const [];
  bool _saving = false;

  LedgerController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    _type = const ['支出', '收入', '转账'].contains(widget.initialType)
        ? widget.initialType
        : '支出';
    _accountId = controller.accounts.isEmpty
        ? null
        : controller.accounts.first.id;
    _toAccountId = controller.accounts.length < 2
        ? null
        : controller.accounts[1].id;
    _category = _choices.isEmpty ? null : _choices.first.name;
    _loadEntryPreferences();
  }

  @override
  void dispose() {
    _note.dispose();
    _categorySearch.dispose();
    super.dispose();
  }

  List<_MobileCategoryChoice> get _choices {
    final source = _type == '支出'
        ? controller.expenseCategories
        : controller.incomeCategories;
    if (source.isNotEmpty) {
      return source
          .where((item) => item.isActive)
          .map(
            (item) => _MobileCategoryChoice(
              name: item.name,
              icon: item.icon,
              color: _mobileHex(item.color),
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
          (item) => query.isEmpty || item.name.toLowerCase().contains(query),
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
            _AmountDisplay(amount: _amount, type: _type),
            const SizedBox(height: 16),
            _Keypad(onKey: _inputKey),
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
            TextField(
              controller: _note,
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.notes_rounded, color: _mobileMuted),
                hintText: '添加备注，例如：午餐、地铁、房租…',
              ),
            ),
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
                        '保存$_type ${_mobileMoney(_amountCents)}',
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
    for (final account in controller.accounts) {
      if (account.id == _accountId) return '${account.icon}  ${account.name}';
    }
    return controller.accounts.isEmpty
        ? '暂无账户'
        : '${controller.accounts.first.icon}  ${controller.accounts.first.name}';
  }

  String get _destinationAccountName {
    for (final account in controller.accounts) {
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
    if (controller.accounts.isEmpty) return;
    final id = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: _mobileSurface,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: controller.accounts
              .map(
                (account) => ListTile(
                  leading: Text(
                    account.icon,
                    style: const TextStyle(fontSize: 24),
                  ),
                  title: Text(account.name),
                  subtitle: Text(
                    '${_mobileMoney(account.balanceCents)} · ${account.currency} · ${account.type}',
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
    final haptics = await _entryPreferences.hapticsEnabled();
    if (mounted) {
      setState(() {
        _recentCategories = recent;
        _hapticsEnabled = haptics;
      });
    }
  }

  Future<void> _selectCategory(String category) async {
    setState(() => _category = category);
    if (_accountManuallySelected) return;
    final accountId = await _entryPreferences.accountForCategory(category);
    if (!mounted || accountId == null) return;
    if (controller.accounts.any((account) => account.id == accountId)) {
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
    if (amount <= 0 || (_type != '转账' && _category == null)) {
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
        );
      } else {
        await controller.addEntry(
          amount: amount,
          title: _note.text.trim().isEmpty ? _category! : _note.text.trim(),
          category: _category!,
          type: _type,
          accountId: _accountId,
          occurredAt: _occurredAt.toUtc().toIso8601String(),
          mood: _type == '支出' ? _mood : null,
          splitWithMemberId: _type == '支出' ? _splitMemberId : null,
          splitMode: _type == '支出' && _splitMemberId != null
              ? _splitMode
              : null,
          mySharePercent: _splitMode == '按比例平摊' ? _mySharePercent : 100,
        );
      }
      if (!mounted) return;
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
          _note.clear();
        });
      } else {
        Navigator.pop(context);
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$error')));
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
  const _MonthlyCard({required this.page});

  final TransactionPage page;

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
            _mobileMoney(page.balanceCents),
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
                ),
              ),
              Expanded(
                child: _SummaryValue(
                  label: '支出',
                  amount: page.expenseCents,
                  color: _mobileExpense,
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
  const _BillSummary({required this.page});

  final TransactionPage page;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _MetricCard(
            label: '收入',
            value: _mobileMoney(page.incomeCents),
            color: _mobileIncome,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _MetricCard(
            label: '支出',
            value: _mobileMoney(page.expenseCents),
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
  const _DaySummaryHeader({required this.day, required this.items});

  final DateTime day;
  final List<TransactionItem> items;

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
          '收 ${_mobileMoney(income)}  支 ${_mobileMoney(expense)}  结 ${_mobileMoney(income - expense)}',
          style: const TextStyle(color: _mobileMuted, fontSize: 12),
        ),
      ],
    );
  }
}

class _TransactionTile extends StatelessWidget {
  const _TransactionTile({required this.item, this.dense = false, this.onTap});

  final TransactionItem item;
  final bool dense;
  final VoidCallback? onTap;

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
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: 14,
          vertical: dense ? 12 : 14,
        ),
        decoration: BoxDecoration(
          color: _mobileSurface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: _mobileLine),
        ),
        child: Row(
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
              '${item.isIncome ? '+' : '-'}${_mobileMoney(item.amountCents)}',
              style: TextStyle(color: color, fontWeight: FontWeight.w800),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryChart extends StatelessWidget {
  const _CategoryChart({required this.buckets, required this.maxAmount});

  final List<AnalysisBucket> buckets;
  final int maxAmount;

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
                  _mobileMoney(bucket.amountCents),
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
  const _ProfileHeader({required this.user});

  final SessionUser? user;

  @override
  Widget build(BuildContext context) {
    final name = user?.displayName ?? 'Neo Ledger 用户';
    return Row(
      children: [
        CircleAvatar(
          radius: 28,
          backgroundColor: _mobileBrand.withAlpha(40),
          child: Text(
            name.isEmpty ? '?' : name.substring(0, 1),
            style: const TextStyle(
              color: _mobileBrand,
              fontSize: 22,
              fontWeight: FontWeight.w800,
            ),
          ),
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

class _NetWorthCard extends StatelessWidget {
  const _NetWorthCard({
    required this.accountTotal,
    required this.assetTotal,
    required this.ledgerName,
  });

  final int accountTotal;
  final int assetTotal;
  final String ledgerName;

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
            _mobileMoney(accountTotal + assetTotal),
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
                  label: '账户余额',
                  amount: accountTotal,
                  color: _mobileBrand,
                ),
              ),
              Expanded(
                child: _SummaryValue(
                  label: '数字资产',
                  amount: assetTotal,
                  color: _mobilePurple,
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
  });

  final String label;
  final int amount;
  final Color color;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: const TextStyle(color: _mobileMuted, fontSize: 12)),
      const SizedBox(height: 4),
      Text(
        _mobileMoney(amount),
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
  const _AmountDisplay({required this.amount, required this.type});

  final String amount;
  final String type;

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
          '¥$amount',
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
  });

  final String name;
  final String icon;
  final Color color;
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

void _showComingSoon(BuildContext context, String title) {
  ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text('$title正在接入原生移动端，完整管理仍可在桌面端使用。')));
}
