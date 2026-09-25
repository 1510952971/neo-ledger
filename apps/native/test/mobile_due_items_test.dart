import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/domain/mobile_due_items.dart';
import 'package:neo_ledger/models.dart';

void main() {
  test('paused subscription is excluded from the upcoming schedule', () {
    final items = upcomingMobileDueItems(
      now: DateTime(2026, 9, 24),
      subscriptions: const [
        Subscription(
          id: 1,
          ledgerId: 3,
          name: '暂停的云盘',
          amountCents: 199,
          cycle: '每月',
          nextChargeDate: '2026-09-25',
          isPaused: true,
        ),
        Subscription(
          id: 2,
          ledgerId: 3,
          name: '正常音乐会员',
          amountCents: 500,
          cycle: '每月',
          nextChargeDate: '2026-09-25',
        ),
      ],
      installments: const [],
      accounts: const [],
    );

    expect(items.map((item) => item.title), ['正常音乐会员']);
  });

  test(
    'orders overdue and upcoming subscriptions, installments, and card dates',
    () {
      final items = upcomingMobileDueItems(
        now: DateTime(2026, 9, 24, 18),
        subscriptions: const [
          Subscription(
            id: 1,
            name: '音乐会员',
            amountCents: 1800,
            cycle: '每月',
            nextChargeDate: '2026-09-25',
          ),
          Subscription(
            id: 2,
            name: '逾期订阅',
            amountCents: 3000,
            cycle: '每月',
            nextChargeDate: '2026-09-20',
          ),
          Subscription(
            id: 3,
            name: '无效日期',
            amountCents: 100,
            cycle: '每月',
            nextChargeDate: '2026-02-31',
          ),
        ],
        installments: const [
          Installment(
            id: 1,
            name: '手机分期',
            totalAmountCents: 120000,
            periods: 12,
            paidPeriods: 0,
            feeAmountCents: 1200,
            startMonth: '2026-09',
            chargeDay: 31,
          ),
          Installment(
            id: 2,
            name: '已完成分期',
            totalAmountCents: 10000,
            periods: 2,
            paidPeriods: 2,
            feeAmountCents: 0,
            startMonth: '2026-09',
          ),
        ],
        accounts: const [
          Account(
            id: 1,
            ledgerId: 1,
            name: '主信用卡',
            type: '负债',
            balanceCents: -250000,
            billDay: 25,
            repaymentDay: 2,
          ),
        ],
      );

      expect(items.map((item) => item.title).toSet(), {
        '逾期订阅',
        '手机分期',
        '音乐会员',
        '主信用卡账单日',
      });
      expect(items.first.dueDate, DateTime(2026, 9, 20));
      final installment = items.singleWhere((item) => item.title == '手机分期');
      expect(installment.dueDate, DateTime(2026, 9, 30));
      expect(installment.amountCents, 10100);
      expect(
        items
            .where((item) => item.title == '音乐会员' || item.title == '主信用卡账单日')
            .every((item) => item.dueDate == DateTime(2026, 9, 25)),
        isTrue,
      );
      expect(
        items.any((item) => item.kind == MobileDueKind.creditRepayment),
        isFalse,
      );
    },
  );

  test(
    'clamps credit-card days to short months and supports leap February',
    () {
      final february = upcomingMobileDueItems(
        now: DateTime(2028, 2, 1),
        subscriptions: const [],
        installments: const [],
        accounts: const [
          Account(
            id: 1,
            ledgerId: 1,
            name: '信用账户',
            type: '负债',
            balanceCents: -1,
            repaymentDay: 31,
          ),
        ],
        horizonDays: 30,
      );

      expect(february.single.dueDate, DateTime(2028, 2, 29));
    },
  );

  test(
    'shows estimated statement-to-repayment interval for card reminders',
    () {
      final items = upcomingMobileDueItems(
        now: DateTime(2026, 9, 24),
        subscriptions: const [],
        installments: const [],
        accounts: const [
          Account(
            id: 1,
            ledgerId: 1,
            name: '日常信用卡',
            type: '负债',
            balanceCents: -100000,
            billDay: 25,
            repaymentDay: 2,
          ),
        ],
        horizonDays: 10,
      );

      final repayment = items.singleWhere(
        (item) => item.kind == MobileDueKind.creditRepayment,
      );
      expect(repayment.dueDate, DateTime(2026, 10, 2));
      expect(repayment.detail, contains('账单日至还款日约 7 天'));
      expect(repayment.detail, contains('以银行账单为准'));
    },
  );

  test('planning horizon includes fixed expenses later in the month', () {
    final items = upcomingMobileDueItems(
      now: DateTime(2026, 9, 1),
      subscriptions: const [
        Subscription(
          id: 1,
          name: '月底订阅',
          amountCents: 1200,
          cycle: '每月',
          nextChargeDate: '2026-09-25',
        ),
      ],
      installments: const [],
      accounts: const [],
      horizonDays: 30,
    );

    expect(items.single.title, '月底订阅');
    expect(items.single.dueDate, DateTime(2026, 9, 25));
  });
}
