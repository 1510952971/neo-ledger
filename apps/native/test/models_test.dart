import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/models.dart';

void main() {
  group('TransactionItem', () {
    test('identifies income and preserves edits with copyWith', () {
      const expense = TransactionItem(
        id: 1,
        title: '咖啡店',
        amountCents: 1850,
        type: '支出',
        category: '餐饮',
        occurredAt: '2026-08-26T10:00:00Z',
      );

      expect(expense.isIncome, isFalse);
      expect(expense.amount, 18.5);
      expect(expense.copyWith(amountCents: 2000, category: '办公').amount, 20);
      expect(
        expense.copyWith(amountCents: 2000, category: '办公').category,
        '办公',
      );

      final income = expense.copyWith(type: '收入');
      expect(income.isIncome, isTrue);
    });
  });

  test('parses pending transaction details from the API contract', () {
    final pending = PendingTransaction.fromJson({
      'id': 'pending-1',
      'source': 'android-notification',
      'title': '抖音商城',
      'amount': 2488,
      'currency': 'CNY',
      'occurredAt': '2026-08-26T10:00:00Z',
      'status': 'pending',
      'automationSuggestion': {'category': '餐饮'},
      'rawText': '支付成功 ¥24.88',
    });

    expect(pending.amountCents, 2488);
    expect(pending.title, '抖音商城');
    expect(pending.suggestion, '餐饮');
  });

  test('parses digital assets without losing optional fields', () {
    final asset = DigitalAsset.fromJson({
      'id': 'asset-1',
      'name': '现金',
      'symbol': 'CASH',
      'assetType': '现金',
      'currentValue': 10000,
      'purchasePrice': 10000,
      'currency': 'CNY',
      'updatedAt': '2026-08-26T10:00:00Z',
    });

    expect(asset.valueCents, 10000);
    expect(asset.currency, 'CNY');
  });

  test('keeps an explicit timezone in offline sync payloads', () {
    const entry = OfflineEntry(
      offlineId: 'offline-1',
      ledgerId: 1,
      accountId: 2,
      amount: 18.88,
      type: '支出',
      title: '抖音商城',
      category: '餐饮',
      occurredAt: '2026-08-23T17:39:00+08:00',
    );

    final json = entry.toJson();
    expect(json['occurredAt'], '2026-08-23T17:39:00+08:00');
    expect(json['originalTimezone'], 'Asia/Shanghai');
  });

  test('generates UTC ISO timestamps for new offline entries', () {
    expect(iso8601NowUtc(), endsWith('Z'));
  });
}
