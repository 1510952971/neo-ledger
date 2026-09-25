import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/app.dart';
import 'package:neo_ledger/l10n/generated/app_localizations.dart';
import 'package:neo_ledger/mobile_ledger_shell.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets(
    'entry save action stays reachable on a narrow, large-text phone',
    (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      SharedPreferences.setMockInitialValues({});
      final controller = LedgerController();
      controller.loadDemo();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(1.8)),
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: MobileAddTransactionPage(controller: controller),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final saveButton = find.byKey(const ValueKey('mobile-entry-save'));
      expect(saveButton, findsOneWidget);
      expect(tester.getBottomLeft(saveButton).dy, lessThanOrEqualTo(640));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'hardware keyboard edits amount without stealing text-field input',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      SharedPreferences.setMockInitialValues({});
      final controller = LedgerController();
      controller.loadDemo();
      addTearDown(controller.dispose);

      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: MobileAddTransactionPage(controller: controller),
        ),
      );
      await tester.pumpAndSettle();

      await tester.sendKeyEvent(LogicalKeyboardKey.digit1);
      await tester.sendKeyEvent(LogicalKeyboardKey.digit2);
      await tester.sendKeyEvent(LogicalKeyboardKey.numpadAdd);
      await tester.sendKeyEvent(LogicalKeyboardKey.digit3);
      await tester.pumpAndSettle();
      expect(find.text('CNY 12+3'), findsOneWidget);

      final titleField = find.byKey(const ValueKey('mobile-entry-title'));
      await tester.drag(find.byType(ListView), const Offset(0, -1200));
      await tester.pumpAndSettle();
      await tester.ensureVisible(titleField);
      await tester.tap(titleField);
      await tester.pump();
      await tester.enterText(titleField, '午餐');
      await tester.sendKeyEvent(LogicalKeyboardKey.digit3);
      await tester.pumpAndSettle();

      expect(tester.widget<TextField>(titleField).controller!.text, '午餐');
      final saveLabel = tester.widget<Text>(
        find.descendant(
          of: find.byKey(const ValueKey('mobile-entry-save')),
          matching: find.byType(Text),
        ),
      );
      expect(saveLabel.data, contains('15'));
    },
  );
}
