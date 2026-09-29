import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/app.dart';
import 'package:neo_ledger/l10n/generated/app_localizations.dart';
import 'package:neo_ledger/mobile_ledger_shell.dart';

void main() {
  testWidgets('primary mobile navigation and quick entry expose semantics', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final controller = LedgerController();
    controller.loadDemo();

    try {
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: MobileLedgerShell(
            controller: controller,
            nativeVersion: 'test',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byTooltip('展开侧边栏'), findsOneWidget);
      expect(find.byType(Drawer), findsNothing);
      expect(find.bySemanticsLabel(RegExp('记一笔')), findsOneWidget);

      await tester.tap(find.byTooltip('展开侧边栏'));
      await tester.pumpAndSettle();
      expect(find.byType(Drawer), findsOneWidget);
      expect(find.text('首页'), findsOneWidget);
      expect(find.text('账单'), findsOneWidget);
      expect(find.text('分析'), findsOneWidget);
      expect(find.text('我的'), findsOneWidget);

      await tester.tap(find.text('我的'));
      await tester.pumpAndSettle();
      expect(find.byType(Drawer), findsNothing);
      expect(find.text('外观与个性化'), findsOneWidget);
      expect(find.text('主题与外观'), findsNothing);
    } finally {
      controller.dispose();
      semantics.dispose();
    }
  });
}
