part of '../../mobile_ledger_shell.dart';

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
        foregroundColor: _mobileOnBrand,
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
                MobileAssetRow(
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
      builder: (_) => AccountTransferHistorySheet(
        account: account,
        accounts: controller.accounts,
        hideAmounts: controller.preferences.hideAmounts,
        history: controller.fetchAccountTransfers(account.id),
        fetchHistory: controller.fetchAccountTransfers,
        onEdit: (transfer, values) => controller.updateAccountTransfer(
          transfer,
          kind: values.kind,
          fromAccountId: values.fromAccountId,
          toAccountId: values.toAccountId,
          amount: values.amount,
          occurredAt: values.occurredAt,
          originalTimezone: values.originalTimezone,
          note: values.note,
        ),
        onDelete: controller.deleteAccountTransfer,
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
          const MobileEmptyState(
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
    _currency =
        account?.currency ?? widget.controller.preferences.defaultCurrency;
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
