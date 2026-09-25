import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../mobile/core/mobile_design.dart';
import '../../models.dart';

class MobileAssetRow extends StatelessWidget {
  const MobileAssetRow({
    super.key,
    required this.asset,
    required this.onEdit,
    required this.onLiquidate,
    required this.hideAmounts,
  });

  final DigitalAsset asset;
  final VoidCallback onEdit;
  final VoidCallback onLiquidate;
  final bool hideAmounts;

  @override
  Widget build(BuildContext context) {
    final icon = switch (asset.assetType) {
      '房产' => '🏠',
      '车辆' => '🚗',
      '贵金属' => '💎',
      _ => '📦',
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: MobileSpacing.xs),
      child: Material(
        color: MobileColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MobileRadii.large),
          side: BorderSide(color: MobileColors.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: ListTile(
          onTap: onEdit,
          leading: Text(icon, style: const TextStyle(fontSize: 22)),
          title: Text(asset.name),
          subtitle: Text(
            '${asset.assetType} · ${asset.currency} · ${asset.valuationMode ?? '手动估值'}',
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                hideAmounts
                    ? '••••'
                    : _formatMoney(asset.currentValueCents ?? asset.valueCents),
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              PopupMenuButton<String>(
                onSelected: (value) {
                  if (value == 'edit') onEdit();
                  if (value == 'liquidate') onLiquidate();
                },
                itemBuilder: (context) => const [
                  PopupMenuItem(value: 'edit', child: Text('编辑资产')),
                  PopupMenuItem(value: 'liquidate', child: Text('变现/注销')),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatMoney(int cents) => NumberFormat.currency(
    locale: 'zh_CN',
    symbol: '¥',
    decimalDigits: 2,
  ).format(cents / 100);
}
