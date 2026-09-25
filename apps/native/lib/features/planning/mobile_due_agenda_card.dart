import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../mobile/core/mobile_design.dart';
import '../../mobile/domain/mobile_due_items.dart';

class MobileDueAgendaCard extends StatelessWidget {
  const MobileDueAgendaCard({
    super.key,
    required this.items,
    required this.hideAmounts,
    this.onTap,
    this.maxItems = 6,
    this.title = '近期日程',
    this.now,
  });

  final List<MobileDueItem> items;
  final bool hideAmounts;
  final VoidCallback? onTap;
  final int maxItems;
  final String title;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    final visibleItems = items.take(maxItems).toList();
    final today = now ?? DateTime.now();

    return Material(
      color: MobileColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MobileRadii.large),
        side: BorderSide(color: MobileColors.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(MobileSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.event_note_rounded, color: MobileColors.brand),
                  const SizedBox(width: MobileSpacing.xs),
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  Text(
                    '${items.length} 项${items.length > visibleItems.length ? ' · 更多' : ''} ›',
                    style: TextStyle(color: MobileColors.muted, fontSize: 12),
                  ),
                ],
              ),
              const SizedBox(height: MobileSpacing.sm),
              for (var index = 0; index < visibleItems.length; index++) ...[
                if (index > 0) const SizedBox(height: MobileSpacing.xs),
                _DueAgendaRow(
                  item: visibleItems[index],
                  hideAmounts: hideAmounts,
                  now: today,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _DueAgendaRow extends StatelessWidget {
  const _DueAgendaRow({
    required this.item,
    required this.hideAmounts,
    required this.now,
  });

  final MobileDueItem item;
  final bool hideAmounts;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final days = _calendarDay(item.dueDate)
        .difference(_calendarDay(now))
        .inDays;
    final dateLabel = switch (days) {
      < 0 => '逾期${-days}天',
      0 => '今天',
      1 => '明天',
      _ => DateFormat('MM-dd').format(item.dueDate),
    };
    final amount = item.amountCents;

    return Row(
      children: [
        SizedBox(
          width: 48,
          child: Text(
            dateLabel,
            maxLines: 1,
            overflow: TextOverflow.clip,
            style: TextStyle(
              color: days < 0 ? MobileColors.expense : MobileColors.muted,
              fontSize: 11,
              fontWeight: days <= 1 ? FontWeight.w700 : FontWeight.normal,
            ),
          ),
        ),
        const SizedBox(width: MobileSpacing.xs),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13),
              ),
              if (item.detail case final detail?)
                Text(
                  detail,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: MobileColors.muted, fontSize: 10),
                ),
            ],
          ),
        ),
        if (amount != null) ...[
          const SizedBox(width: MobileSpacing.xs),
          Text(
            hideAmounts ? '••••' : _money(amount),
            maxLines: 1,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ],
      ],
    );
  }

  DateTime _calendarDay(DateTime value) =>
      DateTime.utc(value.year, value.month, value.day);

  String _money(int cents) => NumberFormat.currency(
    locale: 'zh_CN',
    symbol: '¥',
    decimalDigits: 2,
  ).format(cents / 100);
}
