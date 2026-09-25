import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/domain/mobile_background_refresh_policy.dart';

void main() {
  group('MobileBackgroundRefreshPolicy', () {
    final start = DateTime(2026, 9, 24, 12);

    test('probes frequently but only requires periodic full refresh', () {
      final policy = MobileBackgroundRefreshPolicy(lastFullRefreshAt: start);

      expect(
        MobileBackgroundRefreshPolicy.probeInterval,
        const Duration(seconds: 30),
      );
      expect(
        policy.isFullRefreshDue(
          start.add(const Duration(minutes: 4, seconds: 59)),
        ),
        isFalse,
      );
      expect(
        policy.isFullRefreshDue(start.add(const Duration(minutes: 5))),
        isTrue,
      );
    });

    test('a change-triggered refresh does not move the periodic fallback', () {
      final policy = MobileBackgroundRefreshPolicy(lastFullRefreshAt: start);

      expect(
        policy.isFullRefreshDue(start.add(const Duration(minutes: 5))),
        isTrue,
      );
      expect(
        policy.isFullRefreshDue(start.add(const Duration(minutes: 5))),
        isTrue,
      );

      policy.recordFullRefresh(start.add(const Duration(minutes: 5)));
      expect(
        policy.isFullRefreshDue(
          start.add(const Duration(minutes: 9, seconds: 59)),
        ),
        isFalse,
      );
      expect(
        policy.isFullRefreshDue(start.add(const Duration(minutes: 10))),
        isTrue,
      );
    });
  });
}
