import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/features/accounts/mobile_asset_row.dart';
import 'package:neo_ledger/models.dart';

void main() {
  const asset = DigitalAsset(
    id: 1,
    name: '通勤车',
    assetType: '车辆',
    currency: 'CNY',
    valueCents: 1234,
    purchasePriceCents: 2000,
  );

  testWidgets(
    'shows formatted valuation and hides it when privacy is enabled',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MobileAssetRow(
              asset: asset,
              onEdit: () {},
              onLiquidate: () {},
              hideAmounts: false,
            ),
          ),
        ),
      );

      expect(find.text('¥12.34'), findsOneWidget);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MobileAssetRow(
              asset: asset,
              onEdit: () {},
              onLiquidate: () {},
              hideAmounts: true,
            ),
          ),
        ),
      );

      expect(find.text('••••'), findsOneWidget);
      expect(find.text('¥12.34'), findsNothing);
    },
  );
}
