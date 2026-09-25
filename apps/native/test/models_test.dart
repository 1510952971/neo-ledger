import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/models.dart';

void main() {
  test('shared display preferences round trip with safe defaults', () {
    final preferences = Preferences.fromJson({
      'theme': 'glacier',
      'mobileThemeMode': 'system',
      'highContrast': true,
      'defaultCurrency': 'JPY',
    });
    expect(preferences.theme, 'glacier');
    expect(preferences.mobileThemeMode, 'system');
    expect(preferences.highContrast, isTrue);
    expect(preferences.defaultCurrency, 'JPY');
    expect(
      Preferences.fromJson({'defaultCurrency': 'INVALID'}).defaultCurrency,
      'CNY',
    );
  });
  test('session profile metadata survives JSON and avatar copy updates', () {
    final user = SessionUser.fromJson({
      'username': 'peng',
      'displayName': '彭',
      'email': 'peng@example.com',
      'avatarUrl': 'data:image/png;base64,AA==',
      'createdAt': '2025-01-02T03:04:05.000Z',
      'passwordEnabled': true,
      'linkedProviders': ['wechat'],
    });

    final decoded = SessionUser.fromJson(user.toJson());
    expect(decoded.email, 'peng@example.com');
    expect(decoded.createdAt, '2025-01-02T03:04:05.000Z');
    expect(decoded.passwordEnabled, isTrue);
    expect(decoded.linkedProviders, ['wechat']);
    expect(decoded.copyWith(clearAvatar: true).avatarUrl, isNull);
    expect(decoded.copyWith(displayName: '新昵称').email, decoded.email);
  });

  test('screenshot recognition source and correction metadata survive offline queue round trips', () {
    const entry = OfflineEntry(
      offlineId: 'native-123',
      ledgerId: 1,
      accountId: 2,
      amount: 18.8,
      type: '支出',
      title: '便利店',
      category: '餐饮',
      occurredAt: '2026-09-23T10:00:00.000Z',
      source: '截图本地识别',
      recognitionText: '支付成功\n金额：¥ 18.80\n手机号：[手机号已隐藏]',
      recognitionCompleteness: 95,
      recognitionCorrections: {
        'amount': {'recognized': 18.8, 'confirmed': 18.9},
      },
    );

    final decoded = OfflineEntry.fromJson(entry.toJson());
    expect(decoded.source, '截图本地识别');
    expect(decoded.recognitionText, contains('[手机号已隐藏]'));
    expect(decoded.recognitionCompleteness, 95);
    expect(decoded.recognitionCorrections['amount']['confirmed'], 18.9);
  });

  test(
    'category budgets preserve monthly carryover and effective allowance',
    () {
      final budget = CategoryBudget.fromJson({
        'ledgerId': 3,
        'category': '餐饮',
        'amount': 150000,
        'carryoverEnabled': true,
        'carryoverAmount': 25000,
        'availableAmount': 175000,
      });

      expect(budget.amountCents, 150000);
      expect(budget.carryoverEnabled, isTrue);
      expect(budget.carryoverAmountCents, 25000);
      expect(budget.availableAmountCents, 175000);
      expect(budget.toJson()['availableAmount'], 175000);
    },
  );

  test(
    'subscription pause state survives API and local snapshot round trips',
    () {
      final subscription = Subscription.fromJson({
        'id': 12,
        'ledgerId': 4,
        'name': '云盘',
        'amount': 1990,
        'cycle': '每月',
        'accountId': 7,
        'category': '工具',
        'nextChargeDate': '2026-09-30',
        'isPaused': true,
      });

      expect(subscription.isPaused, isTrue);
      expect(subscription.ledgerId, 4);
      expect(Subscription.fromJson(subscription.toJson()).isPaused, isTrue);
    },
  );

  test(
    'recurring tasks preserve cadence, reminder and pause state in snapshots',
    () {
      final task = RecurringTask.fromJson({
        'id': 31,
        'ledgerId': 6,
        'name': '每月房租',
        'amount': 325000,
        'type': '支出',
        'accountId': 12,
        'cycle': '每月',
        'category': '住房',
        'nextRunDate': '2026-10-01',
        'reminderDays': 3,
        'isPaused': true,
      });

      final restored = RecurringTask.fromJson(task.toJson());
      expect(restored.ledgerId, 6);
      expect(restored.amountCents, 325000);
      expect(restored.cycle, '每月');
      expect(restored.nextRunDate, '2026-10-01');
      expect(restored.reminderDays, 3);
      expect(restored.isPaused, isTrue);
    },
  );

  test('transfer history preserves both linked accounts and currency', () {
    final transfer = AccountTransfer.fromJson({
      'ledgerId': 3,
      'uuid': 'transfer-1',
      'kind': '账户转账',
      'fromAccountId': 7,
      'fromAccountName': '工资卡',
      'toAccountId': 9,
      'toAccountName': '储蓄卡',
      'amount': 12550,
      'currency': 'CNY',
      'occurredAt': '2026-09-23T10:00:00Z',
      'originalTimezone': 'Asia/Shanghai',
      'note': '每月存款',
      'updatedAt': '2026-09-23T10:00:00.000Z',
    });

    expect(transfer.fromAccountId, 7);
    expect(transfer.fromAccountName, '工资卡');
    expect(transfer.toAccountId, 9);
    expect(transfer.toAccountName, '储蓄卡');
    expect(transfer.amountCents, 12550);
    expect(transfer.currency, 'CNY');
    expect(transfer.note, '每月存款');
    expect(transfer.ledgerId, 3);
    expect(transfer.updatedAt, '2026-09-23T10:00:00.000Z');
  });

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

  test('category round-trips a parent relationship', () {
    final category = Category.fromJson({
      'id': 2,
      'ledgerId': 1,
      'name': '猫粮',
      'parentId': 1,
      'isActive': true,
    });

    expect(category.parentId, 1);
    expect(category.toJson()['parentId'], 1);
  });
}
