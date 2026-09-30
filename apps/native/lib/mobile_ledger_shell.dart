import 'dart:async';
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import 'app.dart';
import 'api_client.dart';
import 'l10n/generated/app_localizations.dart';
import 'mobile/core/mobile_design.dart';
import 'mobile/data/mobile_entry_preferences.dart';
import 'mobile/data/mobile_screenshot_ocr.dart';
import 'mobile/domain/amount_expression.dart';
import 'mobile/domain/mobile_background_refresh_policy.dart';
import 'mobile/domain/mobile_due_items.dart';
import 'mobile/domain/mobile_money_formatter.dart';
import 'mobile/domain/mobile_screenshot_recognition.dart';
import 'mobile/core/mobile_state_widgets.dart';
import 'mobile/core/mobile_route_registry.dart';
import 'mobile/core/mobile_layout_policy.dart';
import 'features/accounts/account_transfer_history_sheet.dart';
import 'features/accounts/mobile_asset_row.dart';
import 'features/overview/mobile_portfolio_card.dart';
import 'features/planning/mobile_due_agenda_card.dart';
import 'features/profile/avatar_crop_sheet.dart';
import 'features/profile/mobile_mfa_settings_sheet.dart';
import 'features/profile/mobile_diagnostics_sheet.dart';
import 'features/profile/mobile_tag_manager_sheet.dart';
import 'models.dart';
import 'shortcut_entry.dart';
import 'update_service.dart';

part 'mobile/parts/mobile_auth_pages.dart';
part 'mobile/parts/mobile_home_page.dart';
part 'mobile/parts/mobile_bill_pages.dart';
part 'mobile/parts/mobile_profile_automation_pages.dart';
part 'mobile/parts/mobile_planning_budget_pages.dart';
part 'mobile/parts/mobile_accounts_pages.dart';
part 'mobile/parts/mobile_entry_pages.dart';
part 'mobile/parts/mobile_shared_widgets.dart';

Color get _mobileBg => MobileColors.background;
Color get _mobileSurface => MobileColors.surface;
Color get _mobileSurfaceRaised => MobileColors.surfaceRaised;
Color get _mobileLine => MobileColors.line;
Color get _mobileBrand => MobileColors.brand;
Color get _mobilePurple => MobileColors.purple;
Color get _mobileMuted => MobileColors.muted;
Color get _mobileText => MobileColors.foreground;
Color get _mobileOnBrand => MobileColors.onBrand;
Color get _mobileIncome => MobileColors.income;
Color get _mobileExpense => MobileColors.expense;
const _supportedMobileCurrencies = ['CNY', 'USD', 'JPY', 'EUR'];

enum _MobileDrawerShortcut { ledgers, assets, planning, appearance, guide }

Future<void> _confirmMobileLogout(
  BuildContext context,
  LedgerController controller,
) async {
  final pending = controller.totalPendingCount;
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('退出当前账号？'),
      content: Text(
        pending == 0
            ? '已同步数据不会受到影响。退出后需要重新登录才能继续使用。'
            : '当前还有 $pending 笔数据待同步或待确认。退出不会删除本地队列，但建议同步完成后再退出。',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          child: const Text('仍要退出'),
        ),
      ],
    ),
  );
  if (confirmed == true && context.mounted) {
    await controller.logout();
  }
}

class MobileLedgerShell extends StatefulWidget {
  const MobileLedgerShell({
    super.key,
    required this.controller,
    required this.nativeVersion,
  });

  final LedgerController controller;
  final String nativeVersion;

  @override
  State<MobileLedgerShell> createState() => _MobileLedgerShellState();
}

class _MobileLedgerShellState extends State<MobileLedgerShell>
    with WidgetsBindingObserver {
  int _tab = 0;
  int _profileVisit = 0;
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  bool _locked = false;
  bool _lockInitialized = false;
  bool _refreshInFlight = false;
  final _backgroundRefreshPolicy = MobileBackgroundRefreshPolicy();
  AppLifecycleState _lifecycleState = AppLifecycleState.resumed;
  Timer? _backgroundRefreshTimer;

  LedgerController get controller => widget.controller;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final imageCache = PaintingBinding.instance.imageCache;
    imageCache.maximumSize = 120;
    imageCache.maximumSizeBytes = 48 * 1024 * 1024;
    _backgroundRefreshTimer = Timer.periodic(
      MobileBackgroundRefreshPolicy.probeInterval,
      (_) => _refreshInBackground(),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _backgroundRefreshTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _lifecycleState = state;
    if (state == AppLifecycleState.resumed) _refreshInBackground();
    if (state != AppLifecycleState.resumed ||
        !controller.authenticated ||
        !controller.preferences.lockEnabled ||
        _locked) {
      return;
    }
    if (mounted) setState(() => _locked = true);
  }

  @override
  void didHaveMemoryPressure() {
    final imageCache = PaintingBinding.instance.imageCache;
    imageCache.clear();
    imageCache.clearLiveImages();
  }

  void _refreshInBackground() {
    if (!mounted ||
        _lifecycleState != AppLifecycleState.resumed ||
        _refreshInFlight ||
        !controller.authenticated ||
        controller.demoMode ||
        controller.loading) {
      return;
    }
    _refreshInFlight = true;
    unawaited(_refreshSilently());
  }

  Future<void> _refreshSilently() async {
    try {
      if (controller.queue.isNotEmpty) {
        await controller.syncQueue(silent: true);
        _backgroundRefreshPolicy.recordFullRefresh();
      } else if (_backgroundRefreshPolicy.isFullRefreshDue()) {
        await controller.refresh(silent: true);
        _backgroundRefreshPolicy.recordFullRefresh();
      } else {
        await controller.refreshIfChanged(silent: true);
      }
    } catch (_) {
      // Periodic sync is opportunistic; keep the current screen usable offline.
    } finally {
      _refreshInFlight = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = AppLocalizations.of(context)!;
    if (!controller.authenticated) {
      _lockInitialized = false;
      _locked = false;
      if (controller.loading || controller.api.hasSession) {
        return const MobileLoadingView();
      }
      return MobileLoginPage(controller: controller);
    }

    if (!_lockInitialized) {
      _lockInitialized = true;
      if (controller.preferences.lockEnabled) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && controller.authenticated) {
            setState(() => _locked = true);
          }
        });
      }
    }
    if (_locked) {
      return MobileAppLockPage(
        controller: controller,
        onUnlocked: () => setState(() => _locked = false),
      );
    }

    final pages = [
      MobileHomePage(
        controller: controller,
        onAdd: _openAdd,
        onTransfer: () => _openAdd(initialType: '转账'),
        onMenuPressed: _openMenu,
      ),
      MobileBillsPage(controller: controller, onMenuPressed: _openMenu),
      MobileAnalysisPage(controller: controller, onMenuPressed: _openMenu),
      MobileProfilePage(
        key: ValueKey('profile-$_profileVisit'),
        controller: controller,
        nativeVersion: widget.nativeVersion,
        onMenuPressed: _openMenu,
      ),
    ];
    return PopScope<Object?>(
      canPop: _tab == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _tab != 0) setState(() => _tab = 0);
      },
      child: LayoutBuilder(
        builder: (context, constraints) {
          final useRail = mobileUsesNavigationRail(constraints.maxWidth);
          final destinations = [
            NavigationRailDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home_rounded),
              label: Text(strings.home),
            ),
            NavigationRailDestination(
              icon: Icon(Icons.receipt_long_outlined),
              selectedIcon: Icon(Icons.receipt_long_rounded),
              label: Text(strings.bills),
            ),
            NavigationRailDestination(
              icon: Icon(Icons.insights_outlined),
              selectedIcon: Icon(Icons.insights_rounded),
              label: Text(strings.analytics),
            ),
            NavigationRailDestination(
              icon: Icon(Icons.person_outline_rounded),
              selectedIcon: Icon(Icons.person_rounded),
              label: Text(strings.profile),
            ),
          ];
          return Scaffold(
            key: _scaffoldKey,
            backgroundColor: _mobileBg,
            drawer: useRail
                ? null
                : Drawer(
                    backgroundColor: _mobileSurfaceRaised,
                    width: 264,
                    child: SafeArea(
                      child: Column(
                        children: [
                          ListTile(
                            title: const Text('Neo Ledger'),
                            trailing: IconButton(
                              tooltip: '收起侧边栏',
                              icon: const Icon(Icons.close_rounded),
                              onPressed: () => Navigator.pop(context),
                            ),
                          ),
                          const Divider(height: 1),
                          for (
                            var index = 0;
                            index < destinations.length;
                            index++
                          )
                            ListTile(
                              leading: Icon(switch (index) {
                                0 => Icons.home_rounded,
                                1 => Icons.receipt_long_rounded,
                                2 => Icons.insights_rounded,
                                _ => Icons.person_rounded,
                              }),
                              title: Text(switch (index) {
                                0 => strings.home,
                                1 => strings.bills,
                                2 => strings.analytics,
                                _ => strings.profile,
                              }),
                              selected: _tab == index,
                              selectedTileColor: _mobileBrand.withValues(
                                alpha: .12,
                              ),
                              onTap: () {
                                Navigator.pop(context);
                                _selectTab(index);
                              },
                            ),
                          const Divider(height: 20),
                          const Padding(
                            padding: EdgeInsets.fromLTRB(20, 0, 20, 6),
                            child: Align(
                              alignment: Alignment.centerLeft,
                              child: Text(
                                '快捷入口',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: .6,
                                  color: Colors.black54,
                                ),
                              ),
                            ),
                          ),
                          _MobileDrawerShortcutTile(
                            icon: Icons.menu_book_rounded,
                            title: '我的账本',
                            onTap: () => _openDrawerShortcut(
                              _MobileDrawerShortcut.ledgers,
                            ),
                          ),
                          _MobileDrawerShortcutTile(
                            icon: Icons.account_balance_wallet_rounded,
                            title: '个人资产',
                            onTap: () => _openDrawerShortcut(
                              _MobileDrawerShortcut.assets,
                            ),
                          ),
                          _MobileDrawerShortcutTile(
                            icon: Icons.event_note_rounded,
                            title: '管理规划',
                            onTap: () => _openDrawerShortcut(
                              _MobileDrawerShortcut.planning,
                            ),
                          ),
                          _MobileDrawerShortcutTile(
                            icon: Icons.palette_outlined,
                            title: '主题与外观',
                            onTap: () => _openDrawerShortcut(
                              _MobileDrawerShortcut.appearance,
                            ),
                          ),
                          _MobileDrawerShortcutTile(
                            icon: Icons.menu_book_outlined,
                            title: '操作手册',
                            onTap: () => _openDrawerShortcut(
                              _MobileDrawerShortcut.guide,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
            body: Row(
              children: [
                if (useRail)
                  NavigationRail(
                    selectedIndex: _tab,
                    labelType: NavigationRailLabelType.all,
                    onDestinationSelected: _selectTab,
                    destinations: destinations,
                  ),
                Expanded(
                  child: Center(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        maxWidth: mobileContentMaxWidth(constraints.maxWidth),
                      ),
                      child: IndexedStack(index: _tab, children: pages),
                    ),
                  ),
                ),
              ],
            ),
            floatingActionButton: FloatingActionButton(
              heroTag: 'mobile-add-entry',
              tooltip: strings.quickEntry,
              backgroundColor: _mobileBrand,
              foregroundColor: _mobileOnBrand,
              elevation: 8,
              onPressed: _openAdd,
              child: Semantics(
                label: strings.quickEntry,
                child: const Icon(Icons.add_rounded, size: 30),
              ),
            ),
            floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
            bottomNavigationBar: null,
          );
        },
      ),
    );
  }

  Future<void> _openAdd({String initialType = '支出'}) async {
    await MobileRouteRegistry.push<void>(
      context,
      MobileRouteName.entry,
      arguments: initialType,
    );
  }

  void _openMenu() => _scaffoldKey.currentState?.openDrawer();

  void _openDrawerShortcut(_MobileDrawerShortcut shortcut) {
    Navigator.of(context).pop();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      switch (shortcut) {
        case _MobileDrawerShortcut.ledgers:
          showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            useSafeArea: true,
            showDragHandle: true,
            backgroundColor: _mobileSurface,
            builder: (_) => MobileLedgerManagerSheet(controller: controller),
          );
        case _MobileDrawerShortcut.assets:
          unawaited(
            MobileRouteRegistry.push<void>(context, MobileRouteName.accounts),
          );
        case _MobileDrawerShortcut.planning:
          unawaited(
            MobileRouteRegistry.push<void>(context, MobileRouteName.planning),
          );
        case _MobileDrawerShortcut.appearance:
          showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            showDragHandle: true,
            backgroundColor: _mobileSurface,
            builder: (_) => MobileAppearanceSheet(controller: controller),
          );
        case _MobileDrawerShortcut.guide:
          showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            showDragHandle: true,
            backgroundColor: _mobileSurface,
            builder: (_) => const MobileUserGuideSheet(),
          );
      }
    });
  }

  void _selectTab(int index) {
    setState(() {
      if (index == 3 && _tab != 3) _profileVisit++;
      _tab = index;
    });
  }
}

class _MobileDrawerShortcutTile extends StatelessWidget {
  const _MobileDrawerShortcutTile({
    required this.icon,
    required this.title,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
    dense: true,
    leading: Icon(icon, color: _mobileMuted),
    title: Text(title),
    onTap: onTap,
  );
}

BoxDecoration _mobileBoxDecoration({Gradient? gradient}) => BoxDecoration(
  color: gradient == null ? _mobileSurface : null,
  gradient: gradient,
  borderRadius: BorderRadius.circular(18),
  border: Border.all(color: _mobileLine),
);

String _mobileMoney(int cents) => MobileMoneyFormatter.format(cents);

String _mobileMoneyCurrency(int cents, String currency) =>
    MobileMoneyFormatter.format(cents, currency: currency);

String _mobileDate(String value) {
  final parsed = DateTime.tryParse(value);
  return parsed == null
      ? value
      : DateFormat('MM-dd HH:mm').format(parsed.toLocal());
}

String _greeting() {
  final hour = DateTime.now().hour;
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

Color _mobileHex(String value) {
  final normalized = value.replaceFirst('#', '').trim();
  final hex = normalized.length == 6 ? 'FF$normalized' : normalized;
  final parsed = int.tryParse(hex, radix: 16);
  return parsed == null ? _mobilePurple : Color(parsed);
}

List<AnalysisBucket> _fallbackBuckets(List<TransactionItem> items) {
  final totals = <String, int>{};
  for (final item in items.where((item) => !item.isIncome)) {
    final name = item.category?.trim().isNotEmpty == true
        ? item.category!
        : '未分类';
    totals[name] = (totals[name] ?? 0) + item.amountCents;
  }
  return totals.entries
      .map((entry) => AnalysisBucket(name: entry.key, amountCents: entry.value))
      .toList()
    ..sort((a, b) => b.amountCents.compareTo(a.amountCents));
}
