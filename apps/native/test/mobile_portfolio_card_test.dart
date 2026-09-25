import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/features/overview/mobile_portfolio_card.dart';
import 'package:neo_ledger/models.dart';

Forecast _forecastFromApi() => Forecast.fromJson({
  'netWorth': 647076,
  'assetTotal': 648000,
  'accountAssetTotal': 72000,
  'digitalAssetTotal': 576000,
  'liabilityTotal': 924,
  'debtRatio': 0.14,
  'inflationRate': 2.5,
  'realNetWorthOneYear': 631294,
  'allocation': [
    {'assetClass': '现金流', 'amount': 0},
    {'assetClass': '固收防守', 'amount': 0},
    {'assetClass': '风险进攻', 'amount': 72000},
  ],
  'averageDailySpend': 1000,
  'monthlyFixed': 0,
  'runwayDays': 647,
  'hasSpendingData': true,
  'points': [
    {
      'label': '2026年9月',
      'date': '2026-09-01',
      'balance': 647076,
      'danger': false,
    },
    {
      'label': '2027年9月',
      'date': '2027-09-01',
      'balance': 600000,
      'danger': false,
    },
  ],
});

void main() {
  testWidgets('shows shared portfolio metrics and masks money amounts', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 760);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(18),
            child: MobilePortfolioCard(
              forecast: _forecastFromApi(),
              hideAmounts: true,
            ),
          ),
        ),
      ),
    );

    expect(find.text('资产趋势与结构'), findsOneWidget);
    expect(find.text('负债率'), findsOneWidget);
    expect(find.text('0.1%'), findsOneWidget);
    expect(find.text('风险进攻'), findsOneWidget);
    expect(find.text('¥6,480.00'), findsNothing);
    expect(find.text('••••'), findsNWidgets(6));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'does not render portfolio metrics for legacy forecast payloads',
    (tester) async {
      final forecast = Forecast.fromJson({
        'netWorth': 100,
        'averageDailySpend': 0,
        'monthlyFixed': 0,
        'runwayDays': 0,
        'hasSpendingData': false,
        'points': [],
      });
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: MobilePortfolioCard(forecast: forecast, hideAmounts: false),
          ),
        ),
      );

      expect(find.text('资产趋势与结构'), findsNothing);
    },
  );
}
