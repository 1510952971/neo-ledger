import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/features/accounts/account_transfer_history_sheet.dart';
import 'package:neo_ledger/models.dart';

void main() {
  testWidgets('history sheet masks amounts and protects generated transfers', (
    tester,
  ) async {
    final account = Account(
      id: 1,
      ledgerId: 4,
      name: '日常账户',
      type: '资产',
      balanceCents: 100000,
    );
    final manualTransfer = AccountTransfer(
      ledgerId: 4,
      uuid: 'manual-transfer',
      kind: '账户转账',
      fromAccountId: 1,
      fromAccountName: '日常账户',
      toAccountId: 2,
      toAccountName: '储蓄账户',
      amountCents: 12550,
      currency: 'CNY',
      occurredAt: '2026-09-24T02:00:00Z',
      note: '月度储蓄',
    );
    final generatedTransfer = AccountTransfer(
      ledgerId: 4,
      uuid: 'subscription-transfer',
      kind: '周期转账',
      fromAccountId: 1,
      fromAccountName: '日常账户',
      toAccountId: 2,
      toAccountName: '储蓄账户',
      amountCents: 8000,
      currency: 'CNY',
      occurredAt: '2026-09-23T02:00:00Z',
      note: '自动生成',
      targetType: 'subscription',
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AccountTransferHistorySheet(
            account: account,
            accounts: [account],
            hideAmounts: true,
            history: Future.value([manualTransfer, generatedTransfer]),
            fetchHistory: (_) async => [manualTransfer, generatedTransfer],
            onEdit: (_, _) async {},
            onDelete: (_) async {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('••••'), findsNWidgets(2));
    expect(find.textContaining('125.50'), findsNothing);
    expect(find.byTooltip('管理转账'), findsOneWidget);
    expect(find.byIcon(Icons.lock_outline_rounded), findsOneWidget);

    await tester.tap(find.byTooltip('管理转账'));
    await tester.pumpAndSettle();
    expect(find.text('编辑'), findsOneWidget);
    expect(find.text('删除'), findsOneWidget);
  });
}
