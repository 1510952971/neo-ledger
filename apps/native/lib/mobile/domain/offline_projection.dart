import '../../models.dart';

const offlineTransactionSource = '本地待同步';

int offlineTransactionId(String offlineId) {
  final timestamp = RegExp(r'(\d+)$').firstMatch(offlineId)?.group(1);
  final parsed = int.tryParse(timestamp ?? '');
  if (parsed != null) return -(parsed % 0x3fffffff + 1);

  var value = 17;
  for (final unit in offlineId.codeUnits) {
    value = (value * 31 + unit) & 0x3fffffff;
  }
  return -(value + 1);
}

TransactionItem offlineEntryTransaction(
  OfflineEntry entry,
  Iterable<Account> accounts,
) {
  Account? matchingAccount;
  for (final account in accounts) {
    if (account.id == entry.accountId) {
      matchingAccount = account;
      break;
    }
  }
  final amountCents = (entry.amount * 100).round().abs();
  return TransactionItem(
    id: offlineTransactionId(entry.offlineId),
    ledgerId: entry.ledgerId,
    accountId: entry.accountId,
    title: entry.title,
    amountCents: amountCents,
    type: entry.type,
    occurredAt: entry.occurredAt,
    category: entry.type == '支出' ? entry.category : null,
    incomeCategory: entry.type == '收入' ? entry.category : null,
    mood: entry.mood,
    originalTimezone: entry.originalTimezone,
    accountName: matchingAccount?.name,
    currency: matchingAccount?.currency ?? 'CNY',
    source: offlineTransactionSource,
  );
}

TransactionPage projectOfflineEntries({
  required TransactionPage page,
  required Iterable<OfflineEntry> entries,
  required Iterable<Account> accounts,
  required int ledgerId,
}) {
  final pending = entries
      .where((entry) => entry.ledgerId == ledgerId)
      .map((entry) => offlineEntryTransaction(entry, accounts))
      .toList(growable: false);
  if (pending.isEmpty) return page;

  final pendingIds = pending.map((item) => item.id).toSet();
  final existingPending = page.items
      .where((item) => item.source == offlineTransactionSource)
      .toList(growable: false);
  final serverItems = page.items
      .where(
        (item) =>
            item.source != offlineTransactionSource &&
            !pendingIds.contains(item.id),
      )
      .toList(growable: false);
  final items = [...pending, ...serverItems]
    ..sort((a, b) => b.occurredAt.compareTo(a.occurredAt));
  final pendingIncome = pending
      .where((item) => item.type == '收入')
      .fold<int>(0, (sum, item) => sum + item.amountCents);
  final pendingExpense = pending
      .where((item) => item.type == '支出')
      .fold<int>(0, (sum, item) => sum + item.amountCents);
  final existingPendingIncome = existingPending
      .where((item) => item.type == '收入')
      .fold<int>(0, (sum, item) => sum + item.amountCents);
  final existingPendingExpense = existingPending
      .where((item) => item.type == '支出')
      .fold<int>(0, (sum, item) => sum + item.amountCents);

  return TransactionPage(
    items: items,
    total: page.total - existingPending.length + pending.length,
    incomeCents: page.incomeCents - existingPendingIncome + pendingIncome,
    expenseCents: page.expenseCents - existingPendingExpense + pendingExpense,
    nextCursor: page.nextCursor,
  );
}
