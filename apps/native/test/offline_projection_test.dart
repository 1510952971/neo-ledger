import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/domain/offline_projection.dart';
import 'package:neo_ledger/models.dart';

void main() {
  const account = Account(
    id: 7,
    ledgerId: 3,
    name: '日常卡',
    type: '资产',
    balanceCents: 120000,
    currency: 'CNY',
  );

  OfflineEntry entry({
    required String id,
    required String type,
    required double amount,
    int ledgerId = 3,
  }) => OfflineEntry(
    offlineId: id,
    ledgerId: ledgerId,
    accountId: 7,
    amount: amount,
    type: type,
    title: '待同步流水',
    category: type == '收入' ? '工资' : '餐饮',
    occurredAt: '2026-09-23T02:03:04.000Z',
    mood: '刚需',
  );

  test('将离线记账映射为稳定的待同步流水', () {
    final pending = entry(
      id: 'native-1790123456789000',
      type: '支出',
      amount: 12.34,
    );

    final first = offlineEntryTransaction(pending, const [account]);
    final second = offlineEntryTransaction(pending, const [account]);

    expect(first.id, isNegative);
    expect(first.id, second.id);
    expect(first.amountCents, 1234);
    expect(first.accountName, '日常卡');
    expect(first.category, '餐饮');
    expect(first.source, offlineTransactionSource);
  });

  test('仅投影当前账本并正确更新月度汇总', () {
    const serverItem = TransactionItem(
      id: 99,
      ledgerId: 3,
      accountId: 7,
      title: '已同步',
      amountCents: 500,
      type: '支出',
      occurredAt: '2026-09-22T02:03:04.000Z',
    );
    const page = TransactionPage(
      items: [serverItem],
      total: 1,
      incomeCents: 0,
      expenseCents: 500,
      nextCursor: 'next-page',
    );

    final projected = projectOfflineEntries(
      page: page,
      entries: [
        entry(id: 'native-1', type: '收入', amount: 20),
        entry(id: 'native-2', type: '支出', amount: 3.5),
        entry(id: 'native-3', type: '支出', amount: 99, ledgerId: 4),
      ],
      accounts: const [account],
      ledgerId: 3,
    );

    expect(projected.items, hasLength(3));
    expect(projected.total, 3);
    expect(projected.incomeCents, 2000);
    expect(projected.expenseCents, 850);
    expect(projected.nextCursor, 'next-page');
  });

  test('重复投影不会重复计数', () {
    final pending = entry(id: 'native-42', type: '支出', amount: 8);
    const empty = TransactionPage(
      items: [],
      total: 0,
      incomeCents: 0,
      expenseCents: 0,
    );

    final once = projectOfflineEntries(
      page: empty,
      entries: [pending],
      accounts: const [account],
      ledgerId: 3,
    );
    final twice = projectOfflineEntries(
      page: once,
      entries: [pending],
      accounts: const [account],
      ledgerId: 3,
    );

    expect(twice.items, hasLength(1));
    expect(twice.total, 1);
    expect(twice.expenseCents, 800);
  });
}
