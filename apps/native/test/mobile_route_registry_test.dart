import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/core/mobile_route_registry.dart';

void main() {
  testWidgets('dispatches a named route and forwards its arguments', (
    tester,
  ) async {
    final registry = MobileRouteRegistry({
      '/test/detail': MobileRouteDefinition(
        (_, arguments) => Scaffold(body: Text('detail:$arguments')),
      ),
    });

    await tester.pumpWidget(
      MaterialApp(
        onGenerateRoute: registry.onGenerateRoute,
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => MobileRouteRegistry.push<void>(
              context,
              '/test/detail',
              arguments: 42,
            ),
            child: const Text('open'),
          ),
        ),
      ),
    );

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('detail:42'), findsOneWidget);
  });

  test('unknown routes are left for the parent router to handle', () {
    final registry = MobileRouteRegistry(const {});

    expect(
      registry.onGenerateRoute(const RouteSettings(name: '/not-registered')),
      isNull,
    );
  });

  test('uses an iOS route that supports the platform back-swipe gesture', () {
    final registry = MobileRouteRegistry({
      '/test/detail': MobileRouteDefinition((_, _) => const SizedBox.shrink()),
    }, platform: TargetPlatform.iOS);

    expect(
      registry.onGenerateRoute(const RouteSettings(name: '/test/detail')),
      isA<CupertinoPageRoute<void>>(),
    );
  });

  test('keeps Android on the Material route behavior', () {
    final registry = MobileRouteRegistry({
      '/test/detail': MobileRouteDefinition((_, _) => const SizedBox.shrink()),
    }, platform: TargetPlatform.android);

    expect(
      registry.onGenerateRoute(const RouteSettings(name: '/test/detail')),
      isA<MaterialPageRoute<void>>(),
    );
  });
}
