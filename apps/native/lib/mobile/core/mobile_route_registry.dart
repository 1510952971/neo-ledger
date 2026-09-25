import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

abstract final class MobileRouteName {
  static const home = '/mobile/home';
  static const bills = '/mobile/bills';
  static const analysis = '/mobile/analysis';
  static const profile = '/mobile/profile';
  static const entry = '/mobile/entry';
  static const transactionDetail = '/mobile/transaction-detail';
  static const budget = '/mobile/budget';
  static const accounts = '/mobile/accounts';
  static const assets = '/mobile/assets';
  static const planning = '/mobile/planning';
  static const automation = '/mobile/automation';
}

typedef MobileRouteBuilder = Widget Function(
  BuildContext context,
  Object? arguments,
);

class MobileRouteDefinition {
  const MobileRouteDefinition(this.builder, {this.fullscreenDialog = false});

  final MobileRouteBuilder builder;
  final bool fullscreenDialog;
}

/// Central route table for native mobile destinations.
class MobileRouteRegistry {
  MobileRouteRegistry(
    Map<String, MobileRouteDefinition> routes, {
    TargetPlatform? platform,
  }) : routes = Map.unmodifiable(routes),
       platform = platform ?? defaultTargetPlatform;

  final Map<String, MobileRouteDefinition> routes;
  final TargetPlatform platform;

  Route<dynamic>? onGenerateRoute(RouteSettings settings) {
    final name = settings.name;
    if (name == null) return null;
    final definition = routes[name];
    if (definition == null) return null;
    Widget buildPage(BuildContext context) =>
        definition.builder(context, settings.arguments);
    if (platform == TargetPlatform.iOS) {
      return CupertinoPageRoute<void>(
        settings: settings,
        fullscreenDialog: definition.fullscreenDialog,
        builder: buildPage,
      );
    }
    return MaterialPageRoute<void>(
      settings: settings,
      fullscreenDialog: definition.fullscreenDialog,
      builder: buildPage,
    );
  }

  static Future<T?> push<T>(
    BuildContext context,
    String name, {
    Object? arguments,
  }) => Navigator.of(context).pushNamed<T>(name, arguments: arguments);
}
