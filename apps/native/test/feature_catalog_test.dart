import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/feature_catalog.dart';

void main() {
  test('keeps every feature id unique and mapped to every platform', () {
    final ids = FeatureCatalog.all.map((feature) => feature.id).toList();

    expect(ids.toSet(), hasLength(ids.length));
    for (final feature in FeatureCatalog.all) {
      expect(feature.label, isNotEmpty);
      expect(feature.entryPoint, isNotEmpty);
      expect(feature.availability.keys, containsAll(FeatureCatalog.platforms));
    }
  });

  test('covers the product capability domains', () {
    final ids = FeatureCatalog.all.map((feature) => feature.id).toSet();

    expect(
      ids,
      containsAll(<String>[
        'dashboard',
        'ledger',
        'transaction-entry',
        'accounts-assets',
        'import',
        'budget',
        'subscription',
        'installment',
        'savings-goal',
        'settlement',
        'analytics',
        'ai',
        'automation',
        'server-sync',
        'security',
        'android-notifications',
        'android-payment-screen',
        'updates',
      ]),
    );
  });
}
