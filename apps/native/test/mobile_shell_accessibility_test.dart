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

      expect(find.bySemanticsLabel(RegExp(r'^首页')), findsWidgets);
      expect(find.bySemanticsLabel(RegExp(r'^账单')), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp(r'^分析')), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp(r'^我的')), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp('记一笔')), findsOneWidget);
    } finally {
      controller.dispose();
      semantics.dispose();
    }
  });
}
