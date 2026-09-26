part of '../../mobile_ledger_shell.dart';

class _MobilePage extends StatelessWidget {
  const _MobilePage({
    required this.controller,
    required this.title,
    required this.child,
    this.trailing,
  });

  final LedgerController controller;
  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _mobileBg,
      appBar: AppBar(
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          if (controller.loading)
            const Padding(
              padding: EdgeInsets.only(right: 12),
              child: Center(
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
          if (trailing != null)
            Padding(
              padding: const EdgeInsets.only(right: 14),
              child: trailing!,
            ),
        ],
      ),
      body: child,
    );
  }
}

class _MonthlyCard extends StatelessWidget {
  const _MonthlyCard({required this.page, required this.hideAmounts});

  final TransactionPage page;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        gradient: const LinearGradient(
          colors: [Color(0xff2f293e), Color(0xff4d3e61)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: const Color(0x33ffffff)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('本月结余', style: TextStyle(color: _mobileMuted, fontSize: 14)),
              Text(
                DateFormat('yyyy.MM').format(DateTime.now()),
                style: TextStyle(color: _mobileMuted, fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            hideAmounts ? '••••' : _mobileMoney(page.balanceCents),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 34,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: _SummaryValue(
                  label: '收入',
                  amount: page.incomeCents,
                  color: _mobileIncome,
                  hideAmount: hideAmounts,
                ),
              ),
              Expanded(
                child: _SummaryValue(
                  label: '支出',
                  amount: page.expenseCents,
                  color: _mobileExpense,
                  hideAmount: hideAmounts,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BillSummary extends StatelessWidget {
  const _BillSummary({required this.page, required this.hideAmounts});

  final TransactionPage page;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _MetricCard(
            label: '收入',
            value: hideAmounts ? '••••' : _mobileMoney(page.incomeCents),
            color: _mobileIncome,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _MetricCard(
            label: '支出',
            value: hideAmounts ? '••••' : _mobileMoney(page.expenseCents),
            color: _mobileExpense,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _MetricCard(
            label: '笔数',
            value: '${page.total}',
            color: _mobilePurple,
          ),
        ),
      ],
    );
  }
}

class _DaySummaryHeader extends StatelessWidget {
  const _DaySummaryHeader({
    required this.day,
    required this.items,
    required this.hideAmounts,
  });

  final DateTime day;
  final List<TransactionItem> items;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    final income = items
        .where((item) => item.isIncome)
        .fold<int>(0, (sum, item) => sum + item.amountCents);
    final expense = items
        .where((item) => !item.isIncome)
        .fold<int>(0, (sum, item) => sum + item.amountCents);
    return Row(
      children: [
        Text(
          '${DateFormat('MM月dd日').format(day)} ${const ['一', '二', '三', '四', '五', '六', '日'][day.weekday - 1]}',
          style: TextStyle(color: _mobileText, fontWeight: FontWeight.w800),
        ),
        const Spacer(),
        Text(
          hideAmounts
              ? '金额已隐藏'
              : '收 ${_mobileMoney(income)}  支 ${_mobileMoney(expense)}  结 ${_mobileMoney(income - expense)}',
          style: TextStyle(color: _mobileMuted, fontSize: 12),
        ),
      ],
    );
  }
}

class _MobileSelectionToolbar extends StatelessWidget {
  const _MobileSelectionToolbar({
    required this.count,
    required this.onCancel,
    required this.onApply,
  });

  final int count;
  final VoidCallback onCancel;
  final VoidCallback onApply;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    decoration: BoxDecoration(
      color: _mobileBrand.withValues(alpha: .12),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: _mobileBrand.withValues(alpha: .45)),
    ),
    child: Row(
      children: [
        Text(
          '已选 $count 笔',
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        const Spacer(),
        TextButton(onPressed: onCancel, child: const Text('取消')),
        FilledButton.icon(
          onPressed: count == 0 ? null : onApply,
          icon: const Icon(Icons.tune_rounded, size: 18),
          label: const Text('批量操作'),
        ),
      ],
    ),
  );
}

class _TransactionTile extends StatelessWidget {
  const _TransactionTile({
    required this.item,
    this.dense = false,
    this.onTap,
    this.onLongPress,
    this.hideAmount = false,
    this.selected = false,
  });

  final TransactionItem item;
  final bool dense;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final bool hideAmount;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final icon = item.category == '餐饮'
        ? '🍜'
        : item.isIncome
        ? '💼'
        : '🧾';
    final color = item.isIncome ? _mobileIncome : _mobileExpense;
    return InkWell(
      onTap: onTap,
      onLongPress: onLongPress,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: 14,
          vertical: dense ? 12 : 14,
        ),
        decoration: BoxDecoration(
          color: _mobileSurface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: selected ? _mobileBrand : _mobileLine),
        ),
        child: Row(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 42,
                  height: 42,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: color.withAlpha(24),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text(icon, style: const TextStyle(fontSize: 21)),
                ),
                if (selected)
                  Positioned(
                    right: -6,
                    top: -6,
                    child: Icon(
                      Icons.check_circle,
                      color: _mobileBrand,
                      size: 19,
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: _mobileText,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${item.category ?? '未分类'} · ${_mobileDate(item.occurredAt)}',
                    style: TextStyle(color: _mobileMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              hideAmount
                  ? '••••'
                  : '${item.isIncome ? '+' : '-'}${_mobileMoneyCurrency(item.amountCents, item.currency)}',
              style: TextStyle(color: color, fontWeight: FontWeight.w800),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryChart extends StatelessWidget {
  const _CategoryChart({
    required this.buckets,
    required this.maxAmount,
    required this.hideAmounts,
    this.color,
  });

  final List<AnalysisBucket> buckets;
  final int maxAmount;
  final bool hideAmounts;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _mobileBoxDecoration(),
      child: Column(
        children: buckets.take(6).map((bucket) {
          final ratio = bucket.amountCents / maxAmount;
          return Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Row(
              children: [
                SizedBox(
                  width: 62,
                  child: Text(
                    bucket.name,
                    style: TextStyle(color: _mobileText, fontSize: 13),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: LinearProgressIndicator(
                      minHeight: 9,
                      value: ratio.clamp(0, 1),
                      backgroundColor: const Color(0x18ffffff),
                      valueColor: AlwaysStoppedAnimation(
                        color ?? _mobilePurple,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  hideAmounts ? '••••' : _mobileMoney(bucket.amountCents),
                  style: TextStyle(color: _mobileMuted, fontSize: 12),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _TrendChart extends StatelessWidget {
  const _TrendChart({required this.points});

  final List<AnalysisTrendPoint> points;

  @override
  Widget build(BuildContext context) {
    final visible = points.length > 12
        ? points.sublist(points.length - 12)
        : points;
    final maxValue = visible.fold<int>(1, (max, item) {
      final value = item.expenseCents > item.incomeCents
          ? item.expenseCents
          : item.incomeCents;
      return value > max ? value : max;
    });
    return Container(
      height: 190,
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 12),
      decoration: _mobileBoxDecoration(),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: visible.map((item) {
          final expense = item.expenseCents / maxValue;
          final income = item.incomeCents / maxValue;
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Expanded(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _ChartBar(value: expense, color: _mobileExpense),
                        const SizedBox(width: 2),
                        _ChartBar(value: income, color: _mobileIncome),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    item.label,
                    maxLines: 1,
                    overflow: TextOverflow.clip,
                    style: TextStyle(color: _mobileMuted, fontSize: 9),
                  ),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _ChartBar extends StatelessWidget {
  const _ChartBar({required this.value, required this.color});

  final double value;
  final Color color;

  @override
  Widget build(BuildContext context) => Flexible(
    child: FractionallySizedBox(
      heightFactor: value.clamp(.02, 1),
      child: Container(
        width: 8,
        decoration: BoxDecoration(
          color: color,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(5)),
        ),
      ),
    ),
  );
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.user, required this.onAvatarTap});

  final SessionUser? user;
  final VoidCallback onAvatarTap;

  @override
  Widget build(BuildContext context) {
    final name = user?.displayName ?? 'Neo Ledger 用户';
    return Row(
      children: [
        InkWell(
          onTap: onAvatarTap,
          customBorder: const CircleBorder(),
          child: _MobileAvatar(user: user, radius: 28),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: TextStyle(
                  color: _mobileText,
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                user?.username ?? '本地演示账号',
                style: TextStyle(color: _mobileMuted, fontSize: 13),
              ),
            ],
          ),
        ),
        Icon(Icons.chevron_right_rounded, color: _mobileMuted),
      ],
    );
  }
}

class _MobileAvatar extends StatelessWidget {
  const _MobileAvatar({required this.user, required this.radius});

  final SessionUser? user;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final avatar = user?.avatarUrl;
    ImageProvider<Object>? image;
    if (avatar != null && avatar.startsWith('data:image/')) {
      final comma = avatar.indexOf(',');
      if (comma >= 0) {
        try {
          image = MemoryImage(base64Decode(avatar.substring(comma + 1)));
        } catch (_) {}
      }
    }
    return CircleAvatar(
      radius: radius,
      backgroundColor: _mobileBrand.withAlpha(40),
      backgroundImage: image,
      child: image == null
          ? Text(
              (user?.displayName.isNotEmpty == true)
                  ? user!.displayName.substring(0, 1)
                  : '?',
              style: TextStyle(
                color: _mobileBrand,
                fontSize: radius * .78,
                fontWeight: FontWeight.w800,
              ),
            )
          : null,
    );
  }
}

class _NetWorthCard extends StatelessWidget {
  const _NetWorthCard({
    required this.assetTotal,
    required this.liabilityTotal,
    required this.ledgerName,
    required this.hideAmounts,
  });

  final int assetTotal;
  final int liabilityTotal;
  final String ledgerName;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: _mobileBoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xff24322b), Color(0xff20242e)],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(ledgerName, style: TextStyle(color: _mobileMuted, fontSize: 13)),
          const SizedBox(height: 6),
          Text(
            hideAmounts ? '••••' : _mobileMoney(assetTotal - liabilityTotal),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 28,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _SummaryValue(
                  label: '总资产',
                  amount: assetTotal,
                  color: _mobileBrand,
                  hideAmount: hideAmounts,
                ),
              ),
              Expanded(
                child: _SummaryValue(
                  label: '总负债',
                  amount: liabilityTotal,
                  color: _mobileExpense,
                  hideAmount: hideAmounts,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SettingsRow extends StatelessWidget {
  const _SettingsRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
  });

  final String icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        decoration: _mobileBoxDecoration(),
        child: Row(
          children: [
            SizedBox(
              width: 34,
              child: Text(icon, style: const TextStyle(fontSize: 22)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: _mobileText,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    style: TextStyle(color: _mobileMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            if (onTap != null)
              Icon(Icons.chevron_right_rounded, color: _mobileMuted),
          ],
        ),
      ),
    );
  }
}

/// A compact, collapsible settings section for the mobile information
/// architecture.  Long lists of flat rows make important capabilities hard
/// to discover and force users to scroll past unrelated controls.
class _MobileCollapsibleSection extends StatefulWidget {
  const _MobileCollapsibleSection({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.child,
    this.initiallyExpanded = true,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Widget child;
  final bool initiallyExpanded;

  @override
  State<_MobileCollapsibleSection> createState() =>
      _MobileCollapsibleSectionState();
}

class _MobileCollapsibleSectionState extends State<_MobileCollapsibleSection> {
  late bool expanded = widget.initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: _mobileBoxDecoration(),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => expanded = !expanded),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 14, 14),
              child: Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: _mobileBrand.withValues(alpha: .13),
                      borderRadius: BorderRadius.circular(13),
                    ),
                    child: Icon(widget.icon, color: _mobileBrand, size: 21),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.title,
                          style: TextStyle(
                            color: _mobileText,
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          widget.subtitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: _mobileMuted, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    expanded
                        ? Icons.keyboard_arrow_up_rounded
                        : Icons.keyboard_arrow_down_rounded,
                    color: _mobileMuted,
                  ),
                ],
              ),
            ),
          ),
          AnimatedSize(
            duration: MobileMotion.standard,
            curve: Curves.easeOutCubic,
            child: expanded
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                    child: widget.child,
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(18),
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: _mobileBoxDecoration(),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 7),
          Text(
            label,
            style: TextStyle(
              color: _mobileText,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    ),
  );
}

class _SummaryValue extends StatelessWidget {
  const _SummaryValue({
    required this.label,
    required this.amount,
    required this.color,
    this.hideAmount = false,
  });

  final String label;
  final int amount;
  final Color color;
  final bool hideAmount;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: TextStyle(color: _mobileMuted, fontSize: 12)),
      const SizedBox(height: 4),
      Text(
        hideAmount ? '••••' : _mobileMoney(amount),
        style: TextStyle(color: color, fontWeight: FontWeight.w800),
      ),
    ],
  );
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: _mobileBoxDecoration(),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: _mobileMuted, fontSize: 12)),
        const SizedBox(height: 7),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: color,
            fontSize: 16,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  );
}

class _InsightCard extends StatelessWidget {
  const _InsightCard({
    required this.title,
    required this.value,
    required this.caption,
    required this.icon,
  });

  final String title;
  final String value;
  final String caption;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: _mobileBoxDecoration(
      gradient: const LinearGradient(
        colors: [Color(0xff293746), Color(0xff2c2741)],
      ),
    ),
    child: Row(
      children: [
        Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: _mobileBrand.withAlpha(30),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: _mobileBrand),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: TextStyle(color: _mobileMuted, fontSize: 13)),
              const SizedBox(height: 5),
              Text(
                value,
                style: TextStyle(
                  color: _mobileText,
                  fontSize: 25,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                caption,
                style: TextStyle(color: _mobileMuted, fontSize: 12),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.action, this.onAction});

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(
        title,
        style: TextStyle(
          color: _mobileText,
          fontSize: 17,
          fontWeight: FontWeight.w800,
        ),
      ),
      if (action != null)
        onAction == null
            ? Text(action!, style: TextStyle(color: _mobileMuted, fontSize: 12))
            : TextButton(
                onPressed: onAction,
                style: TextButton.styleFrom(
                  foregroundColor: _mobileBrand,
                  padding: EdgeInsets.zero,
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text(action!),
              ),
    ],
  );
}

class _MobileBrandMark extends StatelessWidget {
  const _MobileBrandMark();

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(
        width: 44,
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: _mobileBrand,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Text(
          '¥',
          style: TextStyle(
            color: _mobileOnBrand,
            fontSize: 27,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      const SizedBox(width: 12),
      Text(
        'NEO LEDGER',
        style: TextStyle(
          color: _mobileText,
          fontWeight: FontWeight.w800,
          letterSpacing: 3,
        ),
      ),
    ],
  );
}

class _MobileTextField extends StatelessWidget {
  const _MobileTextField({
    required this.controller,
    required this.label,
    required this.icon,
    this.obscureText = false,
    this.suffix,
    this.textInputAction,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final String label;
  final IconData icon;
  final bool obscureText;
  final Widget? suffix;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) => TextField(
    controller: controller,
    obscureText: obscureText,
    textInputAction: textInputAction,
    onSubmitted: onSubmitted,
    style: TextStyle(color: _mobileText),
    decoration: InputDecoration(
      labelText: label,
      prefixIcon: Icon(icon, color: _mobileMuted),
      suffixIcon: suffix,
    ),
  );
}

class _TypeSwitch extends StatelessWidget {
  const _TypeSwitch({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final strings = AppLocalizations.of(context)!;
    final options = <(String, String)>[
      ('支出', strings.expense),
      ('收入', strings.income),
      ('转账', strings.transfer),
    ];
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: _mobileSurface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: options
            .map(
              (option) => Expanded(
                child: GestureDetector(
                  onTap: () => onChanged(option.$1),
                  child: AnimatedContainer(
                    duration: MediaQuery.disableAnimationsOf(context)
                        ? Duration.zero
                        : MobileMotion.fast,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      color: value == option.$1
                          ? (option.$1 == '支出'
                                ? _mobileExpense
                                : option.$1 == '收入'
                                ? _mobileIncome
                                : _mobilePurple)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      option.$2,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: value == option.$1 ? _mobileBg : _mobileMuted,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _AmountDisplay extends StatelessWidget {
  const _AmountDisplay({
    required this.amount,
    required this.type,
    required this.currency,
  });

  final String amount;
  final String type;
  final String currency;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Text(type, style: TextStyle(color: _mobileMuted, fontSize: 13)),
      const SizedBox(height: 4),
      AnimatedSwitcher(
        duration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : MobileMotion.fast,
        transitionBuilder: (child, animation) => FadeTransition(
          opacity: animation,
          child: ScaleTransition(
            scale: Tween(begin: .96, end: 1.0).animate(animation),
            child: child,
          ),
        ),
        child: Text(
          '$currency $amount',
          key: ValueKey(amount),
          style: TextStyle(
            color: type == '支出'
                ? _mobileExpense
                : type == '收入'
                ? _mobileIncome
                : _mobilePurple,
            fontSize: 42,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    ],
  );
}

class _Keypad extends StatelessWidget {
  const _Keypad({required this.onKey});

  final ValueChanged<String> onKey;

  @override
  Widget build(BuildContext context) {
    const keys = [
      '1',
      '2',
      '3',
      '+',
      '4',
      '5',
      '6',
      '-',
      '7',
      '8',
      '9',
      '⌫',
      '清空',
      '0',
      '.',
    ];
    return GridView.count(
      crossAxisCount: 4,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: 2.05,
      children: keys
          .map(
            (key) => InkWell(
              onTap: () => onKey(key),
              borderRadius: BorderRadius.circular(14),
              child: Container(
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: _mobileSurface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: _mobileLine),
                ),
                child: Text(
                  key,
                  style: TextStyle(
                    color: key == '⌫' ? _mobileMuted : _mobileText,
                    fontSize: 21,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          )
          .toList(),
    );
  }
}

class _FormLabel extends StatelessWidget {
  const _FormLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Text(
    label,
    style: TextStyle(color: _mobileText, fontWeight: FontWeight.w800),
  );
}

class _MobileCategoryChoice {
  const _MobileCategoryChoice({
    required this.name,
    required this.icon,
    required this.color,
    this.parentName,
  });

  final String name;
  final String icon;
  final Color color;
  final String? parentName;
}

class _CategoryChoice extends StatelessWidget {
  const _CategoryChoice({
    required this.choice,
    required this.selected,
    required this.onTap,
  });

  final _MobileCategoryChoice choice;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(16),
    child: AnimatedContainer(
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : MobileMotion.fast,
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: selected ? choice.color.withAlpha(38) : _mobileSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: selected ? choice.color : _mobileLine,
          width: selected ? 1.5 : 1,
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (choice.parentName != null)
            Text(
              choice.parentName!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: _mobileMuted, fontSize: 8),
            ),
          Text(choice.icon, style: const TextStyle(fontSize: 20)),
          const SizedBox(height: 4),
          Text(
            choice.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: selected ? _mobileText : _mobileMuted,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    ),
  );
}

class _MobileSelectRow extends StatelessWidget {
  const _MobileSelectRow({
    required this.icon,
    required this.title,
    required this.value,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(14),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
      decoration: _mobileBoxDecoration(),
      child: Row(
        children: [
          Icon(icon, color: _mobileMuted),
          const SizedBox(width: 12),
          Text(title, style: TextStyle(color: _mobileMuted)),
          const Spacer(),
          Text(
            value,
            style: TextStyle(color: _mobileText, fontWeight: FontWeight.w700),
          ),
          const SizedBox(width: 4),
          Icon(Icons.chevron_right_rounded, color: _mobileMuted),
        ],
      ),
    ),
  );
}

class _SyncButton extends StatelessWidget {
  const _SyncButton({required this.controller});

  final LedgerController controller;

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: '同步数据',
    onPressed: controller.loading ? null : controller.refresh,
    icon: Icon(Icons.sync_rounded, color: _mobileMuted),
  );
}
