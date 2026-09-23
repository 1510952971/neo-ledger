import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models.dart';
import 'account_transfer_editor.dart';

typedef FetchAccountTransfers = Future<List<AccountTransfer>> Function(
  int accountId,
);
typedef EditAccountTransfer = Future<void> Function(
  AccountTransfer transfer,
  AccountTransferEditValues values,
);
typedef DeleteAccountTransfer = Future<void> Function(AccountTransfer transfer);

class AccountTransferHistorySheet extends StatefulWidget {
  const AccountTransferHistorySheet({
    super.key,
    required this.account,
    required this.accounts,
    required this.hideAmounts,
    required this.history,
    required this.fetchHistory,
    required this.onEdit,
    required this.onDelete,
  });

  final Account account;
  final List<Account> accounts;
  final bool hideAmounts;
  final Future<List<AccountTransfer>> history;
  final FetchAccountTransfers fetchHistory;
  final EditAccountTransfer onEdit;
  final DeleteAccountTransfer onDelete;

  @override
  State<AccountTransferHistorySheet> createState() =>
      _AccountTransferHistorySheetState();
}

class _AccountTransferHistorySheetState
    extends State<AccountTransferHistorySheet> {
  late Future<List<AccountTransfer>> _history;

  @override
  void initState() {
    super.initState();
    _history = widget.history;
  }

  Future<void> _refresh() async {
    setState(() => _history = widget.fetchHistory(widget.account.id));
  }

  Future<void> _manage(AccountTransfer transfer, String action) async {
    final messenger = ScaffoldMessenger.of(context);
    if (action == 'edit') {
      final values = await showAccountTransferEditor(
        context,
        transfer: transfer,
        accounts: widget.accounts,
      );
      if (values == null) return;
      try {
        await widget.onEdit(transfer, values);
        if (!mounted) return;
        await _refresh();
        messenger.showSnackBar(
          const SnackBar(content: Text('转账已更新，双方账户余额已同步')),
        );
      } catch (error) {
        if (mounted) {
          messenger.showSnackBar(SnackBar(content: Text('更新转账失败：$error')));
        }
      }
      return;
    }

    final agreed = await showDialog<bool>(
      context: context,
      builder: (confirmContext) => AlertDialog(
        title: const Text('删除这笔转账？'),
        content: const Text('删除后会同时冲正转出与转入账户余额，此操作不可撤销。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(confirmContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(confirmContext, true),
            child: const Text('删除转账'),
          ),
        ],
      ),
    );
    if (agreed != true) return;
    try {
      await widget.onDelete(transfer);
      if (!mounted) return;
      await _refresh();
      messenger.showSnackBar(const SnackBar(content: Text('转账已删除，双方账户余额已恢复')));
    } catch (error) {
      if (mounted) {
        messenger.showSnackBar(SnackBar(content: Text('删除转账失败：$error')));
      }
    }
  }

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
              '${widget.account.name} · 转账记录',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            Expanded(
              child: FutureBuilder<List<AccountTransfer>>(
                future: _history,
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
                      final amount = widget.hideAmounts
                          ? '••••'
                          : _moneyCurrency(item.amountCents, item.currency);
                      final editable =
                          item.targetType == null &&
                          item.fromAccountId != null &&
                          item.toAccountId != null &&
                          const ['账户转账', '信用卡还款'].contains(item.kind);
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.swap_horiz_rounded),
                        title: Text(
                          item.note.trim().isEmpty ? item.kind : item.note,
                        ),
                        subtitle: Text(
                          '$from → $to · ${_date(item.occurredAt)}',
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              amount,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            if (editable)
                              PopupMenuButton<String>(
                                tooltip: '管理转账',
                                onSelected: (action) => _manage(item, action),
                                itemBuilder: (_) => const [
                                  PopupMenuItem(
                                    value: 'edit',
                                    child: Text('编辑'),
                                  ),
                                  PopupMenuItem(
                                    value: 'delete',
                                    child: Text('删除'),
                                  ),
                                ],
                              )
                            else
                              const Padding(
                                padding: EdgeInsets.all(12),
                                child: Icon(
                                  Icons.lock_outline_rounded,
                                  size: 18,
                                ),
                              ),
                          ],
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

String _moneyCurrency(int cents, String currency) => NumberFormat.currency(
  locale: 'zh_CN',
  name: currency,
  symbol: currency,
  decimalDigits: currency == 'JPY' ? 0 : 2,
).format(cents / 100);

String _date(String value) {
  final parsed = DateTime.tryParse(value);
  return parsed == null
      ? value
      : DateFormat('MM-dd HH:mm').format(parsed.toLocal());
}
