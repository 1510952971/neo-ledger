import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/features/planning/mobile_due_agenda_card.dart';
import 'package:neo_ledger/mobile/domain/mobile_due_items.dart';

void main() {
  testWidgets('shows actionable due dates and respects amount privacy', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MobileDueAgendaCard(
            now: DateTime(2026, 9, 24),
            items: [
              MobileDueItem(
                title: '房租',
                dueDate: DateTime(2026, 9, 24),
                kind: MobileDueKind.subscription,
                amountCents: 250000,
              ),
            ],
            hideAmounts: true,
          ),
        ),
      ),
    );

    expect(find.text('近期日程'), findsOneWidget);
    expect(find.text('今天'), findsOneWidget);
    expect(find.text('房租'), findsOneWidget);
    expect(find.text('••••'), findsOneWidget);
    expect(find.text('¥2,500.00'), findsNothing);
  });

  testWidgets('long schedule titles do not overflow on a narrow phone', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 700);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: MobileDueAgendaCard(
              now: DateTime(2026, 9, 24),
              items: [
                MobileDueItem(
                  title: '一笔名称特别长的固定周期订阅账单',
                  dueDate: DateTime(2026, 9, 25),
                  kind: MobileDueKind.subscription,
                  amountCents: 123456789,
                ),
              ],
              hideAmounts: false,
              maxItems: 4,
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('明天'), findsOneWidget);
  });

  testWidgets('empty schedules do not leave a blank card', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: MobileDueAgendaCard(items: [], hideAmounts: false),
        ),
      ),
    );

    expect(find.text('近期日程'), findsNothing);
    expect(find.byType(SizedBox), findsWidgets);
  });

  testWidgets('shows credit-card cycle reminder details', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MobileDueAgendaCard(
            now: DateTime(2026, 9, 24),
            items: [
              MobileDueItem(
                title: '日常信用卡还款日',
                dueDate: DateTime(2026, 10, 2),
                kind: MobileDueKind.creditRepayment,
                detail: '账单日至还款日约 7 天 · 以银行账单为准',
              ),
            ],
            hideAmounts: false,
          ),
        ),
      ),
    );

    expect(find.text('账单日至还款日约 7 天 · 以银行账单为准'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
