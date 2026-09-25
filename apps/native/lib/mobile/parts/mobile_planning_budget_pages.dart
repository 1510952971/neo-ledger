part of '../../mobile_ledger_shell.dart';

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
      (sum, item) => sum + item.availableAmountCents,
    );
    final dueItems = _homeDueItems(controller, horizonDays: 30);
    return Scaffold(
      backgroundColor: _mobileBg,
      appBar: AppBar(title: const Text('规划与目标')),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: _mobileBrand,
        foregroundColor: _mobileOnBrand,
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
            if (dueItems.isNotEmpty) ...[
              const SizedBox(height: 12),
              MobileDueAgendaCard(
                items: dueItems,
                hideAmounts: controller.preferences.hideAmounts,
                title: '近期账期日程',
                maxItems: 10,
              ),
            ],
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
                                '${item.isPaused ? '已暂停 · ' : ''}${item.cycle} · ${item.category ?? '未分类'}${item.nextChargeDate == null ? '' : ' · 下次 ${item.nextChargeDate}'}',
                            value: controller.preferences.hideAmounts
                                ? '••••'
                                : _mobileMoney(item.amountCents),
                            onEdit: () => _openSubscription(item),
                            onDelete: () => _deleteSubscription(item),
                            onPause: () => _toggleSubscriptionPaused(item),
                            pauseLabel: item.isPaused ? '恢复自动记账' : '暂停自动记账',
                          ),
                      ],
                    ),
            ),
            const SizedBox(height: 18),
            _PlanningSection(
              title: '周期记账',
              icon: Icons.event_repeat_rounded,
              actionLabel: '新增规则',
              onAction: () => _openRecurringTask(),
              child: controller.recurringTasks.isEmpty
                  ? const _CompactEmpty(message: '还没有周期记账规则')
                  : Column(
                      children: [
                        for (final item in controller.recurringTasks)
                          _PlanningItemCard(
                            icon: item.type == '收入'
                                ? Icons.south_west_rounded
                                : Icons.north_east_rounded,
                            title: item.name,
                            subtitle:
                                '${item.isPaused ? '已暂停 · ' : ''}${item.type} · ${item.cycle} · ${item.category} · 下次 ${item.nextRunDate}${item.reminderDays == 0 ? '' : ' · 提前${item.reminderDays}天提醒'}',
                            value: controller.preferences.hideAmounts
                                ? '••••'
                                : _mobileMoney(item.amountCents),
                            onEdit: () => _openRecurringTask(item),
                            onDelete: () => _deleteRecurringTask(item),
                            onPause: () => _toggleRecurringTask(item),
                            pauseLabel: item.isPaused ? '恢复周期任务' : '暂停周期任务',
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
              leading: const Icon(Icons.event_repeat_rounded),
              title: const Text('新增周期记账规则'),
              onTap: () => Navigator.pop(sheetContext, 'recurring-task'),
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
      case 'recurring-task':
        await _openRecurringTask();
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

  Future<void> _openRecurringTask([RecurringTask? existing]) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) =>
          RecurringTaskSheet(controller: controller, existing: existing),
    );
    if (mounted) setState(() {});
  }

  Future<void> _deleteRecurringTask(RecurringTask item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除周期规则？'),
        content: Text('删除“${item.name}”规则，不会删除已生成的历史账单。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('删除规则'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await controller.deleteRecurringTask(item);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('删除周期规则失败：$error')));
      }
    }
  }

  Future<void> _toggleRecurringTask(RecurringTask item) async {
    try {
      await controller.setRecurringTaskPaused(item, !item.isPaused);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(item.isPaused ? '周期任务已恢复' : '周期任务已暂停，暂停期间不补记'),
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('更新周期规则失败：$error')));
      }
    }
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

  Future<void> _toggleSubscriptionPaused(Subscription item) async {
    try {
      await controller.setSubscriptionPaused(item, !item.isPaused);
      if (mounted) {
        setState(() {});
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(item.isPaused ? '已恢复自动记账' : '已暂停自动记账')),
        );
      }
    } catch (error) {
      _showError('更新订阅状态失败：$error');
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
              Text('储蓄目标', style: TextStyle(color: _mobileMuted, fontSize: 12)),
              const SizedBox(height: 4),
              Text(
                '$goalCount 个',
                style: TextStyle(
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
    this.onPause,
    this.pauseLabel,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String value;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;
  final VoidCallback? onPause;
  final String? pauseLabel;

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
                style: TextStyle(color: _mobileMuted, fontSize: 12),
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
            if (action == 'pause') onPause?.call();
          },
          itemBuilder: (context) => [
            if (onEdit != null)
              const PopupMenuItem(value: 'edit', child: Text('编辑')),
            if (onDelete != null)
              const PopupMenuItem(value: 'delete', child: Text('删除')),
            if (onPause != null)
              PopupMenuItem(
                value: 'pause',
                child: Text(pauseLabel ?? '暂停自动记账'),
              ),
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
              valueColor: AlwaysStoppedAnimation(_mobilePurple),
            ),
          ),
          if (goal.deadline != null) ...[
            const SizedBox(height: 7),
            Text(
              '目标日期：${goal.deadline}',
              style: TextStyle(color: _mobileMuted, fontSize: 12),
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
        Icon(Icons.inbox_outlined, color: _mobileMuted),
        const SizedBox(width: 10),
        Text(message, style: TextStyle(color: _mobileMuted)),
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
        foregroundColor: _mobileOnBrand,
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
              const MobileEmptyState(
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
    final total = budgets.fold<int>(
      0,
      (sum, item) => sum + item.availableAmountCents,
    );
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
          Text('本月预算总览', style: TextStyle(color: _mobileMuted)),
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
    final effectiveAmount = budget.availableAmountCents;
    final ratio = effectiveAmount == 0 ? 0.0 : spentCents / effectiveAmount;
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
                      : '${_mobileMoney(spentCents)} / ${_mobileMoney(effectiveAmount)}',
                  style: TextStyle(
                    color: danger ? _mobileExpense : _mobileMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            if (budget.carryoverEnabled)
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  hideAmounts
                      ? '已开启结余结转 · 金额已隐藏'
                      : '月额度 ${_mobileMoney(budget.amountCents)}${budget.carryoverAmountCents > 0 ? ' + 结转 ${_mobileMoney(budget.carryoverAmountCents)}' : ' · 暂无结转'}',
                  style: TextStyle(color: _mobileMuted, fontSize: 11),
                ),
              ),
            if (budget.carryoverEnabled) const SizedBox(height: 8),
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
  late bool _carryoverEnabled;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final categories = widget.controller.expenseCategories;
    _category =
        widget.existing?.category ??
        (categories.isNotEmpty ? categories.first.name : '餐饮');
    _carryoverEnabled = widget.existing?.carryoverEnabled ?? false;
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
          const SizedBox(height: 4),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            value: _carryoverEnabled,
            onChanged: _saving
                ? null
                : (value) => setState(() => _carryoverEnabled = value),
            title: const Text('结转未用预算'),
            subtitle: const Text('结余带入下月；超支不结转，每月额度自动重置'),
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
      await widget.controller.saveBudget(
        category: _category,
        amount: amount,
        carryoverEnabled: _carryoverEnabled,
      );
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
