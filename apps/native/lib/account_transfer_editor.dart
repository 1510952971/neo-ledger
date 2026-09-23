import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'models.dart';

class AccountTransferEditValues {
  const AccountTransferEditValues({
    required this.kind,
    required this.fromAccountId,
    required this.toAccountId,
    required this.amount,
    required this.occurredAt,
    required this.originalTimezone,
    required this.note,
  });

  final String kind;
  final int fromAccountId;
  final int toAccountId;
  final double amount;
  final String occurredAt;
  final String originalTimezone;
  final String note;
}

Future<AccountTransferEditValues?> showAccountTransferEditor(
  BuildContext context, {
  required AccountTransfer transfer,
  required List<Account> accounts,
}) => showDialog<AccountTransferEditValues>(
  context: context,
  builder: (_) => _AccountTransferEditorDialog(
    transfer: transfer,
    accounts: accounts,
  ),
);

class _AccountTransferEditorDialog extends StatefulWidget {
  const _AccountTransferEditorDialog({
    required this.transfer,
    required this.accounts,
  });

  final AccountTransfer transfer;
  final List<Account> accounts;

  @override
  State<_AccountTransferEditorDialog> createState() =>
      _AccountTransferEditorDialogState();
}

class _AccountTransferEditorDialogState
    extends State<_AccountTransferEditorDialog> {
  late String _kind;
  late int _fromId;
  late int _toId;
  late DateTime _occurredAt;
  late final TextEditingController _amountController;
  late final TextEditingController _noteController;
  String? _error;

  @override
  void initState() {
    super.initState();
    _kind = widget.transfer.kind == '信用卡还款' ? '信用卡还款' : '账户转账';
    _fromId = widget.transfer.fromAccountId ?? 0;
    _toId = widget.transfer.toAccountId ?? 0;
    _occurredAt = DateTime.tryParse(widget.transfer.occurredAt)?.toLocal() ??
        DateTime.now();
    _amountController = TextEditingController(
      text: (widget.transfer.amountCents / 100).toStringAsFixed(2),
    );
    _noteController = TextEditingController(text: widget.transfer.note);
  }

  List<Account> get _fromOptions => widget.accounts
      .where(
        (account) =>
            account.type == '资产' &&
            account.currency == widget.transfer.currency &&
            (account.isActive || account.id == widget.transfer.fromAccountId),
      )
      .toList();

  List<Account> get _toOptions => widget.accounts
      .where(
        (account) =>
            account.type == (_kind == '账户转账' ? '资产' : '负债') &&
            account.currency == widget.transfer.currency &&
            (account.isActive || account.id == widget.transfer.toAccountId),
      )
      .toList();

  @override
  void dispose() {
    _amountController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _pickDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _occurredAt,
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 3650)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_occurredAt),
    );
    if (time == null || !mounted) return;
    setState(() {
      _occurredAt = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
    });
  }

  void _submit() {
    final amount = double.tryParse(_amountController.text.trim());
    if (amount == null || !amount.isFinite || amount <= 0) {
      setState(() => _error = '请输入大于 0 的金额');
      return;
    }
    if (_fromId == _toId ||
        !_fromOptions.any((account) => account.id == _fromId) ||
        !_toOptions.any((account) => account.id == _toId)) {
      setState(() => _error = '请选择有效的转出和转入账户');
      return;
    }
    Navigator.pop(
      context,
      AccountTransferEditValues(
        kind: _kind,
        fromAccountId: _fromId,
        toAccountId: _toId,
        amount: amount,
        occurredAt: DateFormat("yyyy-MM-dd'T'HH:mm").format(_occurredAt),
        originalTimezone: widget.transfer.originalTimezone,
        note: _noteController.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('编辑转账'),
    content: SingleChildScrollView(
      child: SizedBox(
        width: 440,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<String>(
              initialValue: _kind,
              decoration: const InputDecoration(labelText: '转账类型'),
              items: const [
                DropdownMenuItem(value: '账户转账', child: Text('账户转账')),
                DropdownMenuItem(value: '信用卡还款', child: Text('信用卡还款')),
              ],
              onChanged: (value) {
                if (value == null) return;
                setState(() {
                  _kind = value;
                  if (!_toOptions.any((account) => account.id == _toId)) {
                    _toId = _toOptions
                            .where((account) => account.isActive)
                            .firstOrNull
                            ?.id ??
                        0;
                  }
                });
              },
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<int>(
              initialValue: _fromOptions.any((item) => item.id == _fromId)
                  ? _fromId
                  : _fromOptions.firstOrNull?.id,
              decoration: const InputDecoration(labelText: '转出账户'),
              items: _fromOptions
                  .map(
                    (item) => DropdownMenuItem(
                      value: item.id,
                      child: Text('${item.name}${item.isActive ? '' : '（已停用）'}'),
                    ),
                  )
                  .toList(),
              onChanged: (value) => setState(() => _fromId = value ?? 0),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<int>(
              initialValue: _toOptions.any((item) => item.id == _toId)
                  ? _toId
                  : _toOptions.firstOrNull?.id,
              decoration: const InputDecoration(labelText: '转入账户'),
              items: _toOptions
                  .map(
                    (item) => DropdownMenuItem(
                      value: item.id,
                      child: Text('${item.name}${item.isActive ? '' : '（已停用）'}'),
                    ),
                  )
                  .toList(),
              onChanged: (value) => setState(() => _toId = value ?? 0),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: '金额',
                prefixText: '${widget.transfer.currency} ',
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _pickDateTime,
              icon: const Icon(Icons.calendar_month_outlined),
              label: Text(DateFormat('yyyy-MM-dd HH:mm').format(_occurredAt)),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _noteController,
              maxLength: 120,
              decoration: const InputDecoration(labelText: '备注'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
          ],
        ),
      ),
    ),
    actions: [
      TextButton(onPressed: () => Navigator.pop(context), child: const Text('取消')),
      FilledButton(onPressed: _submit, child: const Text('保存修改')),
    ],
  );
}
