import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../mobile/core/mobile_design.dart';
import '../../models.dart';

class MobilePortfolioCard extends StatelessWidget {
  const MobilePortfolioCard({
    super.key,
    required this.forecast,
    required this.hideAmounts,
  });

  final Forecast forecast;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    if (!forecast.hasPortfolioMetrics) return const SizedBox.shrink();
    final maxAllocation = forecast.allocation.fold<int>(
      1,
      (maxValue, item) =>
          item.amountCents > maxValue ? item.amountCents : maxValue,
    );

    return Container(
      padding: const EdgeInsets.all(MobileSpacing.md),
      decoration: BoxDecoration(
        color: MobileColors.surface,
        borderRadius: BorderRadius.circular(MobileRadii.large),
        border: Border.all(color: MobileColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.account_balance_wallet_outlined,
                color: MobileColors.brand,
              ),
              SizedBox(width: MobileSpacing.xs),
              Expanded(
                child: Text(
                  '资产趋势与结构',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              Text(
                '12 个月预测',
                style: TextStyle(color: MobileColors.muted, fontSize: 11),
              ),
            ],
          ),
          const SizedBox(height: MobileSpacing.md),
          Wrap(
            spacing: MobileSpacing.xs,
            runSpacing: MobileSpacing.xs,
            children: [
              _Metric(
                label: '总资产',
                value: _money(forecast.assetTotalCents),
                hideAmounts: hideAmounts,
              ),
              _Metric(
                label: '待还负债',
                value: _money(forecast.liabilityTotalCents),
                hideAmounts: hideAmounts,
              ),
              _Metric(
                label: '负债率',
                value: '${forecast.debtRatio.toStringAsFixed(1)}%',
                hideAmounts: false,
              ),
              _Metric(
                label: '一年后购买力净资产',
                value: _money(forecast.realNetWorthOneYearCents),
                hideAmounts: hideAmounts,
              ),
            ],
          ),
          if (forecast.points.isNotEmpty) ...[
            const SizedBox(height: MobileSpacing.md),
            SizedBox(
              height: 66,
              width: double.infinity,
              child: CustomPaint(
                painter: _ForecastLinePainter(forecast.points),
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  forecast.points.first.label,
                  style: TextStyle(color: MobileColors.muted, fontSize: 10),
                ),
                Text(
                  forecast.points.last.label,
                  style: TextStyle(color: MobileColors.muted, fontSize: 10),
                ),
              ],
            ),
          ],
          if (forecast.allocation.isNotEmpty) ...[
            const SizedBox(height: MobileSpacing.md),
            Text(
              '账户结构',
              style: TextStyle(color: MobileColors.muted, fontSize: 12),
            ),
            const SizedBox(height: MobileSpacing.xs),
            for (final item in forecast.allocation) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  SizedBox(
                    width: 58,
                    child: Text(
                      item.assetClass,
                      style: const TextStyle(fontSize: 11),
                    ),
                  ),
                  const SizedBox(width: MobileSpacing.xs),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(MobileRadii.pill),
                      child: LinearProgressIndicator(
                        minHeight: 6,
                        value: (item.amountCents / maxAllocation)
                            .clamp(0, 1)
                            .toDouble(),
                        backgroundColor: MobileColors.surfaceRaised,
                        valueColor: AlwaysStoppedAnimation(MobileColors.purple),
                      ),
                    ),
                  ),
                  const SizedBox(width: MobileSpacing.xs),
                  Text(
                    hideAmounts ? '••••' : _money(item.amountCents),
                    style: TextStyle(color: MobileColors.muted, fontSize: 11),
                  ),
                ],
              ),
            ],
          ],
          const SizedBox(height: MobileSpacing.xs),
          Text(
            '按当前账本汇率、账户和数字资产估算；预测随消费和固定支出变化。',
            style: TextStyle(
              color: MobileColors.muted,
              fontSize: 10,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }

  String _money(int cents) => NumberFormat.currency(
    locale: 'zh_CN',
    symbol: '¥',
    decimalDigits: 2,
  ).format(cents / 100);
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.label,
    required this.value,
    required this.hideAmounts,
  });

  final String label;
  final String value;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: (MediaQuery.sizeOf(context).width - 88) / 2,
    child: DecoratedBox(
      decoration: BoxDecoration(
        color: MobileColors.surfaceRaised,
        borderRadius: BorderRadius.circular(MobileRadii.small),
      ),
      child: Padding(
        padding: const EdgeInsets.all(MobileSpacing.xs),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: MobileColors.muted, fontSize: 10),
            ),
            const SizedBox(height: 3),
            Text(
              hideAmounts ? '••••' : value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
            ),
          ],
        ),
      ),
    ),
  );
}

class _ForecastLinePainter extends CustomPainter {
  const _ForecastLinePainter(this.points);

  final List<ForecastPoint> points;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;
    final values = points.map((item) => item.balanceCents).toList();
    final minValue = values.reduce(
      (left, right) => left < right ? left : right,
    );
    final maxValue = values.reduce(
      (left, right) => left > right ? left : right,
    );
    final range = (maxValue - minValue).abs();
    final path = Path();
    for (var index = 0; index < values.length; index++) {
      final x = values.length == 1
          ? size.width / 2
          : index * size.width / (values.length - 1);
      final y = range == 0
          ? size.height / 2
          : size.height -
                5 -
                ((values[index] - minValue) / range) * (size.height - 10);
      if (index == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    final color = points.last.danger
        ? MobileColors.expense
        : MobileColors.income;
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(covariant _ForecastLinePainter oldDelegate) =>
      !identical(points, oldDelegate.points);
}
