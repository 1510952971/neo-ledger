part of '../../mobile_ledger_shell.dart';

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

  Future<void> _retrySync() async {
    try {
      await widget.controller.syncQueue();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('同步仍未完成：$error')));
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

  Future<void> _openPendingTransactions() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) => PendingSheet(controller: widget.controller),
    );
  }

  Future<void> _openFeatureHub() =>
      _showMobileFeatureHub(context, widget.controller);

  Future<void> _openAiAssistant() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) => AiSheet(controller: widget.controller),
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final page = controller.transactions;
    final displayName = controller.user?.displayName ?? '朋友';
    final homeDueItems = _homeDueItems(controller);
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
                icon: Icon(
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
              style: TextStyle(color: _mobileMuted, fontSize: 14),
            ),
            const SizedBox(height: 6),
            Text(
              '今天也把生活过得有条理。',
              style: Theme.of(context).textTheme.headlineSmall
                  ?.copyWith(color: _mobileText, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 18),
            _LedgerContextCard(
              controller: controller,
              hideAmounts: _hideAmounts,
            ),
            if (controller.error != null ||
                controller.totalPendingCount > 0) ...[
              const SizedBox(height: 12),
              MobileOfflineStatus(
                message:
                    controller.error ??
                    '还有 ${controller.totalPendingCount} 笔数据等待同步或确认。',
                pendingCount: controller.totalPendingCount,
                offline: controller.error != null,
                onRetry: controller.loading ? null : _retrySync,
              ),
            ],
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
                onTap: _openPendingTransactions,
              ),
            ],
            if (_moduleEnabled('pending') && homeDueItems.isNotEmpty) ...[
              const SizedBox(height: 10),
              MobileDueAgendaCard(
                items: homeDueItems,
                hideAmounts: _hideAmounts,
                onTap: () => MobileRouteRegistry.push<void>(
                  context,
                  MobileRouteName.planning,
                ),
                maxItems: 4,
                title: '近期待办',
              ),
            ],
            if (_moduleEnabled('weeklyTrend') && page.items.isNotEmpty) ...[
              const SizedBox(height: 14),
              _HomeWeeklyTrendCard(page: page, hideAmounts: _hideAmounts),
            ],
            if (_homeHasPlanning(controller)) ...[
              const SizedBox(height: 14),
              _HomePlanningCard(
                controller: controller,
                hideAmounts: _hideAmounts,
                onTap: () => MobileRouteRegistry.push<void>(
                  context,
                  MobileRouteName.planning,
                ),
              ),
            ],
            const SizedBox(height: 14),
            _HomeAiCard(controller: controller, onTap: _openAiAssistant),
            const SizedBox(height: 20),
            _SectionHeader(
              title: '快捷操作',
              action: '全部功能',
              onAction: _openFeatureHub,
            ),
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
                    onTap: () => MobileRouteRegistry.push<void>(
                      context,
                      MobileRouteName.budget,
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
                const MobileEmptyState(
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

bool _homeHasPlanning(LedgerController controller) =>
    controller.subscriptions.isNotEmpty ||
    controller.recurringTasks.isNotEmpty ||
    controller.installments.isNotEmpty ||
    controller.savingsGoals.isNotEmpty;

List<MobileDueItem> _homeDueItems(
  LedgerController controller, {
  int horizonDays = 7,
}) => upcomingMobileDueItems(
  now: DateTime.now(),
  subscriptions: controller.subscriptions,
  installments: controller.installments,
  accounts: controller.activeAccounts,
  horizonDays: horizonDays,
);

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
                  style: TextStyle(
                    color: _mobileText,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${DateFormat('yyyy年MM月').format(DateTime.now())} · ${controller.error == null ? '已同步' : '离线快照'}',
                  style: TextStyle(color: _mobileMuted, fontSize: 12),
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
      (sum, item) => sum + item.availableAmountCents,
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
              Icon(Icons.track_changes_rounded, color: _mobileBrand),
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
            style: TextStyle(color: _mobileMuted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _HomePendingCard extends StatelessWidget {
  const _HomePendingCard({
    required this.controller,
    required this.hideAmounts,
    required this.onTap,
  });

  final LedgerController controller;
  final bool hideAmounts;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final item = controller.pendingTransactions.items.first;
    return Material(
      color: _mobileSurface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: _mobileLine),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(Icons.fact_check_outlined, color: _mobilePurple),
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
                      style: TextStyle(color: _mobileMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              Text(
                '${controller.pendingTransactions.total} 笔 ›',
                style: TextStyle(
                  color: _mobilePurple,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
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
              Icon(Icons.show_chart_rounded, color: _mobilePurple),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  '近 7 日支出',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              Text(
                hideAmounts ? '••••' : _mobileMoney(total),
                style: TextStyle(color: _mobileMuted, fontSize: 12),
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
                            style: TextStyle(color: _mobileMuted, fontSize: 10),
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

class _HomePlanningCard extends StatelessWidget {
  const _HomePlanningCard({
    required this.controller,
    required this.hideAmounts,
    required this.onTap,
  });

  final LedgerController controller;
  final bool hideAmounts;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final recurringCount =
        controller.subscriptions.length + controller.recurringTasks.length;
    final totalPlanned = controller.subscriptions.fold<int>(
      0,
      (sum, item) => sum + item.amountCents,
    );
    final goalCount = controller.savingsGoals.length;
    final installmentCount = controller.installments.length;
    return Material(
      color: _mobileSurface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: _mobileLine),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.event_note_rounded, color: _mobilePurple),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      '规划与目标',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded, color: _mobileMuted),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _PlanningMetric(
                      label: '周期任务',
                      value: '$recurringCount 个',
                      color: _mobilePurple,
                    ),
                  ),
                  Expanded(
                    child: _PlanningMetric(
                      label: '月度订阅',
                      value: hideAmounts ? '••••' : _mobileMoney(totalPlanned),
                      color: _mobileExpense,
                    ),
                  ),
                  Expanded(
                    child: _PlanningMetric(
                      label: '储蓄目标',
                      value: '${goalCount + installmentCount} 个',
                      color: _mobileBrand,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                '包含订阅、周期记账、分期和储蓄目标，点击查看完整规划。',
                style: TextStyle(color: _mobileMuted, fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PlanningMetric extends StatelessWidget {
  const _PlanningMetric({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: TextStyle(color: _mobileMuted, fontSize: 12)),
      const SizedBox(height: 4),
      Text(
        value,
        style: TextStyle(color: color, fontWeight: FontWeight.w800),
      ),
    ],
  );
}

class _HomeAiCard extends StatelessWidget {
  const _HomeAiCard({required this.controller, required this.onTap});

  final LedgerController controller;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final answer = controller.lastAiReply?.answer.trim();
    final hasAnswer = answer != null && answer.isNotEmpty;
    return Material(
      color: _mobileSurface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: _mobileLine),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xff5f52d9), Color(0xffe58bab)],
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.auto_awesome_rounded,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'AI 财务助手',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      hasAnswer
                          ? answer.replaceAll('\n', ' ')
                          : '总结本月收支，帮你发现值得关注的变化',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: _mobileMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: _mobileMuted),
            ],
          ),
        ),
      ),
    );
  }
}
