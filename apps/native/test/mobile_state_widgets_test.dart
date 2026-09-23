import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:neo_ledger/mobile/core/mobile_state_widgets.dart';

void main() {
  testWidgets('empty state exposes a helpful title and next-step message', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: MobileEmptyState(
            icon: Icons.receipt_long,
            title: '没有账单',
            message: '记录第一笔支出开始使用。',
          ),
        ),
      ),
    );

    expect(find.text('没有账单'), findsOneWidget);
    expect(find.text('记录第一笔支出开始使用。'), findsOneWidget);
  });

  testWidgets('inline error retry calls its action', (tester) async {
    var retried = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MobileInlineError(
            message: '连接失败',
            onRetry: () => retried = true,
          ),
        ),
      ),
    );

    await tester.tap(find.text('重试'));
    expect(retried, isTrue);
  });

  testWidgets('offline status communicates pending work and retry action', (
    tester,
  ) async {
    var retried = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: MobileOfflineStatus(
            message: '网络恢复后会自动继续',
            pendingCount: 2,
            offline: true,
            onRetry: () => retried = true,
          ),
        ),
      ),
    );

    expect(find.text('离线快照'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(find.byTooltip('重试同步'), findsOneWidget);
    await tester.tap(find.byTooltip('重试同步'));
    expect(retried, isTrue);
  });

  testWidgets('loading view exposes progress and status text', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: MobileLoadingView(message: '正在读取账本…')),
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('正在读取账本…'), findsOneWidget);
  });
}
