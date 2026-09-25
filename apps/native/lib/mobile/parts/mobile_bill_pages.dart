part of '../../mobile_ledger_shell.dart';

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
                  tooltip: '上个月',
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
                        style: TextStyle(
                          color: _mobileText,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ),
                IconButton(
                  tooltip: '下个月',
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
                        tooltip: '清空搜索',
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
              Align(
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
              MobileInlineError(message: _error!, onRetry: _load),
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
              const MobileEmptyState(
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
                        child: Icon(
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
              leading: Icon(Icons.delete_sweep_outlined, color: _mobileExpense),
              title: Text('批量删除流水', style: TextStyle(color: _mobileExpense)),
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
    await MobileRouteRegistry.push<void>(
      context,
      MobileRouteName.transactionDetail,
      arguments: item,
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
                leading: Icon(
                  Icons.delete_outline_rounded,
                  color: _mobileExpense,
                ),
                title: Text('删除流水', style: TextStyle(color: _mobileExpense)),
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
                Text(item.type, style: TextStyle(color: _mobileMuted)),
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
                  style: TextStyle(
                    color: _mobileText,
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
          if (item.recognitionCompleteness != null)
            _DetailRow(
              label: '字段完整度',
              value: '${item.recognitionCompleteness}%（非模型置信度）',
            ),
          if (item.recognitionText?.trim().isNotEmpty == true)
            _DetailRow(label: '识别文本（已脱敏）', value: item.recognitionText!.trim()),
          if (item.recognitionCorrections.isNotEmpty)
            _DetailRow(
              label: '用户修正',
              value: item.recognitionCorrections.entries
                  .map((entry) {
                    final values = entry.value;
                    if (values is Map) {
                      return '${entry.key}：${values['recognized'] ?? ''} → ${values['confirmed'] ?? ''}';
                    }
                    return '${entry.key}：$values';
                  })
                  .join('\n'),
            ),
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
    decoration: BoxDecoration(
      border: Border(bottom: BorderSide(color: _mobileLine)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 88,
          child: Text(label, style: TextStyle(color: _mobileMuted)),
        ),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: TextStyle(color: _mobileText),
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
      trailing: Icon(Icons.tune_rounded, color: _mobileMuted),
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
          if (controller.forecast?.hasPortfolioMetrics == true) ...[
            const SizedBox(height: 12),
            MobilePortfolioCard(
              forecast: controller.forecast!,
              hideAmounts: hideAmounts,
            ),
          ],
          const SizedBox(height: 24),
          _SectionHeader(title: '支出分类', action: '本月'),
          const SizedBox(height: 10),
          if (buckets.isEmpty)
            const MobileEmptyState(
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
