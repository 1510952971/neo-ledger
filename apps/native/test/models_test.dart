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

  test('keeps optional bookkeeping fields in the offline queue', () {
    const entry = OfflineEntry(
      offlineId: 'offline-2',
      ledgerId: 1,
      accountId: 2,
      amount: 88,
      type: '支出',
      title: '聚餐',
      category: '餐饮',
      occurredAt: '2026-09-23T12:00:00Z',
      mood: '悦己',
      splitWithMemberId: 3,
      splitMode: '平均分摊',
      mySharePercent: 50,
      note: '和同事聚餐',
      tags: ['工作', '报销'],
      reimbursable: true,
      discountAmountCents: 250,
      excludeFromBudget: true,
    );

    final restored = OfflineEntry.fromJson(entry.toJson());
    expect(restored.mood, '悦己');
    expect(restored.splitWithMemberId, 3);
    expect(restored.splitMode, '平均分摊');
    expect(restored.mySharePercent, 50);
    expect(restored.note, '和同事聚餐');
    expect(restored.tags, ['工作', '报销']);
    expect(restored.reimbursable, isTrue);
    expect(restored.discountAmountCents, 250);
    expect(restored.excludeFromBudget, isTrue);
  });

  test('round-trips original currency and account conversion rate', () {
    const entry = OfflineEntry(
      offlineId: 'offline-fx',
      ledgerId: 1,
      accountId: 7,
      amount: 13.89,
      type: '支出',
      title: '境外消费',
      category: '旅行',
      occurredAt: '2026-09-23T12:00:00Z',
      originalAmountCents: 10000,
      originalCurrency: 'CNY',
      exchangeRateMicros: 138889,
    );

    final restored = OfflineEntry.fromJson(entry.toJson());
    expect(restored.originalAmountCents, 10000);
    expect(restored.originalCurrency, 'CNY');
    expect(restored.exchangeRateMicros, 138889);
  });

  test('generates UTC ISO timestamps for new offline entries', () {
    expect(iso8601NowUtc(), endsWith('Z'));
  });

  test('transaction page preserves the server cursor', () {
    final page = TransactionPage.fromJson({
      'items': <Map<String, dynamic>>[],
      'total': 120,
      'income': 0,
      'expense': 0,
      'nextCursor': 'next-page-token',
    });

    expect(page.nextCursor, 'next-page-token');
    expect(page.toJson()['nextCursor'], 'next-page-token');
  });

  test('preferences round-trip synced mobile experience settings', () {
    final preferences = Preferences.fromJson({
      'theme': 'obsidian',
      'lockEnabled': true,
      'hideAmounts': true,
      'hapticsEnabled': false,
      'continuousEntry': true,
      'homeModules': ['recent', 'summary'],
    });

    expect(preferences.theme, 'obsidian');
    expect(preferences.lockEnabled, isTrue);
    expect(preferences.hideAmounts, isTrue);
    expect(preferences.hapticsEnabled, isFalse);
    expect(preferences.continuousEntry, isTrue);
    expect(preferences.homeModules, ['recent', 'summary']);
    expect(preferences.copyWith(hideAmounts: false).hideAmounts, isFalse);
  });
}
