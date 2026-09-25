import '../../models.dart';

enum MobileDueKind { subscription, installment, creditBill, creditRepayment }

class MobileDueItem {
  const MobileDueItem({
    required this.title,
    required this.dueDate,
    required this.kind,
    this.amountCents,
    this.detail,
  });

  final String title;
  final DateTime dueDate;
  final MobileDueKind kind;
  final int? amountCents;
  final String? detail;
}

/// Produces actionable upcoming charges without creating a second schedule or
/// changing the server's recurring-billing rules.
List<MobileDueItem> upcomingMobileDueItems({
  required DateTime now,
  required List<Subscription> subscriptions,
  required List<Installment> installments,
  required List<Account> accounts,
  int horizonDays = 7,
}) {
  final today = DateTime(now.year, now.month, now.day);
  final through = today.add(Duration(days: horizonDays));
  final items = <MobileDueItem>[];

  for (final subscription in subscriptions) {
    if (subscription.isPaused) continue;
    final due = _parseDate(subscription.nextChargeDate);
    if (!subscription.isPaused && due != null && _isRelevant(due, through)) {
      items.add(
        MobileDueItem(
          title: subscription.name,
          dueDate: due,
          kind: MobileDueKind.subscription,
          amountCents: subscription.amountCents,
        ),
      );
    }
  }

  for (final installment in installments) {
    if (installment.remainingPeriods <= 0) continue;
    final start = _parseMonth(installment.startMonth);
    if (start == null) continue;
    final dueMonth = DateTime(
      start.year,
      start.month + installment.paidPeriods,
    );
    final lastDay = DateTime(dueMonth.year, dueMonth.month + 1, 0).day;
    final due = DateTime(
      dueMonth.year,
      dueMonth.month,
      installment.chargeDay.clamp(1, lastDay),
    );
    if (_isRelevant(due, through)) {
      items.add(
        MobileDueItem(
          title: installment.name,
          dueDate: due,
          kind: MobileDueKind.installment,
          amountCents: installment.periods <= 0
              ? 0
              : (installment.totalAmountCents + installment.feeAmountCents) ~/
                    installment.periods,
        ),
      );
    }
  }

  for (final account in accounts) {
    if (!account.isActive || account.type != '负债') continue;
    final billDate = _nextDayOfMonth(today, account.billDay);
    if (billDate != null && _isRelevant(billDate, through)) {
      items.add(
        MobileDueItem(
          title: '${account.name}账单日',
          dueDate: billDate,
          kind: MobileDueKind.creditBill,
        ),
      );
    }
    final repaymentDate = _nextDayOfMonth(today, account.repaymentDay);
    if (repaymentDate != null && _isRelevant(repaymentDate, through)) {
      final billDate = _previousOrSameDayOfMonth(
        repaymentDate,
        account.billDay,
      );
      final estimatedGraceDays = billDate == null
          ? null
          : repaymentDate.difference(billDate).inDays;
      items.add(
        MobileDueItem(
          title: '${account.name}还款日',
          dueDate: repaymentDate,
          kind: MobileDueKind.creditRepayment,
          detail: estimatedGraceDays == null
              ? '请以银行账单显示的最后还款日为准'
              : '账单日至还款日约 $estimatedGraceDays 天 · 以银行账单为准',
        ),
      );
    }
  }

  items.sort((left, right) => left.dueDate.compareTo(right.dueDate));
  return items;
}

bool _isRelevant(DateTime date, DateTime through) => !date.isAfter(through);

DateTime? _parseDate(String? value) {
  if (value == null) return null;
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(value.trim());
  if (match == null) return null;
  final year = int.parse(match.group(1)!);
  final month = int.parse(match.group(2)!);
  final day = int.parse(match.group(3)!);
  final date = DateTime(year, month, day);
  if (date.year != year || date.month != month || date.day != day) return null;
  return date;
}

DateTime? _parseMonth(String? value) {
  if (value == null) return null;
  final match = RegExp(r'^(\d{4})-(\d{2})$').firstMatch(value.trim());
  if (match == null) return null;
  final year = int.parse(match.group(1)!);
  final month = int.parse(match.group(2)!);
  if (month < 1 || month > 12) return null;
  return DateTime(year, month);
}

DateTime? _nextDayOfMonth(DateTime today, int? day) {
  if (day == null || day < 1 || day > 31) return null;
  var year = today.year;
  var month = today.month;
  var candidate = _dateInMonth(year, month, day);
  if (candidate.isBefore(today)) {
    month += 1;
    if (month > 12) {
      year += 1;
      month = 1;
    }
    candidate = _dateInMonth(year, month, day);
  }
  return candidate;
}

DateTime _dateInMonth(int year, int month, int day) {
  final lastDay = DateTime(year, month + 1, 0).day;
  return DateTime(year, month, day.clamp(1, lastDay));
}

DateTime? _previousOrSameDayOfMonth(DateTime date, int? day) {
  if (day == null || day < 1 || day > 31) return null;
  final thisMonth = _dateInMonth(date.year, date.month, day);
  if (!thisMonth.isAfter(date)) return thisMonth;
  final previousMonth = DateTime(date.year, date.month - 1, 1);
  return _dateInMonth(previousMonth.year, previousMonth.month, day);
}
