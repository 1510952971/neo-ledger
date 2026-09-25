import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/core/mobile_layout_policy.dart';

void main() {
  test(
    'uses bottom navigation on phones and a bounded rail layout on tablets',
    () {
      expect(mobileUsesNavigationRail(320), isFalse);
      expect(mobileUsesNavigationRail(839), isFalse);
      expect(mobileUsesNavigationRail(840), isTrue);
      expect(mobileContentMaxWidth(390), 390);
      expect(mobileContentMaxWidth(1366), mobileTabletContentMaxWidth);
    },
  );
}
