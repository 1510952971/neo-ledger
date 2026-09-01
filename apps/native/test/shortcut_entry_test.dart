import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/shortcut_entry.dart';

void main() {
  group('parseShortcutEntryUri', () {
    test('parses a fully populated expense deep link', () {
      final uri = Uri(
        scheme: 'neoledger',
        host: 'entry',
        queryParameters: {
          'amount': '18.88',
          'title': '午餐',
          'category': '餐饮',
          'type': '支出',
          'occurredAt': '2026-08-23T09:56:00+08:00',
          'source': '抖音支付',
        },
      );

      final draft = parseShortcutEntryUri(uri.toString());

      expect(draft, isNotNull);
      expect(draft!.amount, 18.88);
      expect(draft.title, '午餐');
      expect(draft.category, '餐饮');
      expect(draft.type, '支出');
      expect(draft.occurredAt, DateTime.utc(2026, 8, 23, 1, 56));
      expect(draft.source, '抖音支付');
    });

    test('accepts English income and applies safe defaults', () {
      final draft = parseShortcutEntryUri(
        'neoledger://entry?amount=1000&type=income',
      );

      expect(draft, isNotNull);
      expect(draft!.type, '收入');
      expect(draft.title, '快捷指令流水');
      expect(draft.category, '其他');
      expect(draft.source, 'iOS 快捷指令');
      expect(draft.occurredAt, isNull);
    });

    test('rejects malformed or unsafe payloads', () {
      const invalidUris = [
        'http://entry?amount=1&type=支出',
        'neoledger://wrong?amount=1&type=支出',
        'neoledger://entry/details?amount=1&type=支出',
        'neoledger://entry?type=支出',
        'neoledger://entry?amount=0&type=支出',
        'neoledger://entry?amount=-1&type=支出',
        'neoledger://entry?amount=NaN&type=支出',
        'neoledger://entry?amount=Infinity&type=支出',
        'neoledger://entry?amount=1&type=退款',
        'neoledger://entry?amount=1&type=支出&occurredAt=2026-08-23T09:56:00',
        'neoledger://entry?amount=1&type=支出&occurredAt=not-a-date+08:00',
      ];

      for (final raw in invalidUris) {
        expect(
          parseShortcutEntryUri(raw),
          isNull,
          reason: 'Expected invalid URI: $raw',
        );
      }
    });

    test('rejects overlong text fields', () {
      final oversizedTitle = 'x' * 121;
      final uri = Uri(
        scheme: 'neoledger',
        host: 'entry',
        queryParameters: {
          'amount': '1',
          'type': 'expense',
          'title': oversizedTitle,
        },
      );

      expect(parseShortcutEntryUri(uri.toString()), isNull);
    });
  });
}
