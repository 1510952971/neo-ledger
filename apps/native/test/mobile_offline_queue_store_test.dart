import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/data/mobile_offline_queue_store.dart';
import 'package:neo_ledger/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'round trips pending entries without losing sync payload fields',
    () async {
      SharedPreferences.setMockInitialValues({});
      final preferences = await SharedPreferences.getInstance();
      final store = MobileOfflineQueueStore(preferences);
      const entry = OfflineEntry(
        offlineId: 'offline-transaction-1',
        ledgerId: 9,
        accountId: 4,
        amount: 25.5,
        type: '支出',
        title: '午餐',
        note: '和同事',
        tags: ['工作', '报销'],
        category: '餐饮',
        occurredAt: '2026-09-24T12:30:00+08:00',
        mood: '刚需',
        reimbursable: true,
        discountAmountCents: 150,
        excludeFromBudget: true,
        originalAmountCents: 2550,
        originalCurrency: 'USD',
        exchangeRateMicros: 1000000,
        originalTimezone: 'Asia/Shanghai',
      );

      await store.write([entry]);
      final restored = await store.read();

      expect(restored, hasLength(1));
      expect(restored.single.offlineId, entry.offlineId);
      expect(restored.single.ledgerId, entry.ledgerId);
      expect(restored.single.accountId, entry.accountId);
      expect(restored.single.amount, entry.amount);
      expect(restored.single.note, entry.note);
      expect(restored.single.tags, entry.tags);
      expect(restored.single.reimbursable, isTrue);
      expect(restored.single.discountAmountCents, 150);
      expect(restored.single.excludeFromBudget, isTrue);
      expect(restored.single.originalAmountCents, 2550);
      expect(restored.single.originalCurrency, 'USD');
    },
  );

  test(
    'ignores malformed rows while preserving valid queued entries',
    () async {
      SharedPreferences.setMockInitialValues({
        MobileOfflineQueueStore.storageKey: [
          '{broken-json',
          jsonEncode({
            'offlineId': 'valid-row',
            'ledgerId': 3,
            'accountId': 2,
            'amount': 8,
            'type': '支出',
            'title': '咖啡',
            'category': '餐饮',
            'occurredAt': '2026-09-24T09:00:00+08:00',
          }),
          jsonEncode(['not', 'an', 'entry']),
        ],
      });
      final preferences = await SharedPreferences.getInstance();
      final store = MobileOfflineQueueStore(preferences);

      final entries = await store.read();

      expect(entries, hasLength(1));
      expect(entries.single.offlineId, 'valid-row');
    },
  );

  test(
    'continues reading the established queue key after app upgrades',
    () async {
      SharedPreferences.setMockInitialValues({
        'neo_ledger_offline_queue_v1': [
          jsonEncode({
            'offlineId': 'legacy-queue-row',
            'ledgerId': 1,
            'accountId': 1,
            'amount': 3,
            'type': '支出',
            'title': '旧版本待同步',
            'category': '其他',
            'occurredAt': '2026-09-20T10:00:00+08:00',
          }),
        ],
      });
      final preferences = await SharedPreferences.getInstance();
      final store = MobileOfflineQueueStore(preferences);

      expect((await store.read()).single.offlineId, 'legacy-queue-row');
    },
  );
}
